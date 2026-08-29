// Prices every B2B trip against the contracted rate card and writes the result to
// public.b2b_trip_priced, so the API reads a table instead of parsing a spreadsheet per
// request.
//
// Run after a new B2B upload or a rate-card revision:
//   node -r dotenv/config scripts/build-b2b-variance.mjs
//
// Writes one row per invoice trip, always — a trip the card cannot price is kept with a
// NULL rate and a stated reason, so the coverage gap stays visible instead of being
// silently excluded and making the audited share look like the whole book.

import pkg from 'pg'
import { config } from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loadB2bCard, priceTrip, gapReason, vehicleKey } from './b2b-rate-card.mjs'
import { normalizeLocation } from './b2b-locations.mjs'
config()

const __dirname = dirname(fileURLToPath(import.meta.url))
const CARD_PATH = process.env.B2B_RATE_CARD
  || join(__dirname, '..', '..', 'Jopadevi & Reliable Rate Card (4).xlsx')

const pool = new pkg.Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false }, max: 3,
  connectionTimeoutMillis: 60000, statement_timeout: 300000,
})

const card = loadB2bCard(CARD_PATH)
console.log(`rate card: ${card.cells} priced cells from ${card.sheetRows} sheet rows`)

const { rows } = await pool.query(`
  SELECT id, month_year, invoice_number, transporter_name, origin_location,
         destination_location, vehicle_type, "freight_type_FTL_PTL" AS freight_type,
         total_cost
    FROM public.logistics_invoices_b2b`)
console.log(`invoices: ${rows.length}`)

const priced = rows.map(r => {
  const p = priceTrip(card, {
    transporter: r.transporter_name, origin: r.origin_location,
    destination: r.destination_location, vehicleType: r.vehicle_type,
  })
  const billed = Number(r.total_cost) || 0
  return {
    id: r.id, month_year: r.month_year, invoice_number: r.invoice_number,
    transporter: (r.transporter_name || '').trim(),
    origin_raw: r.origin_location, dest_raw: r.destination_location,
    origin: normalizeLocation(r.origin_location),
    dest: normalizeLocation(r.destination_location),
    vehicle: vehicleKey(r.vehicle_type), vehicle_raw: r.vehicle_type,
    freight_type: r.freight_type, billed,
    card_rate: p ? p.rate : null,
    match_tier: p ? p.tier : null,
    // Variance only where a rate exists. GREATEST(...,0) is deliberately NOT applied: a trip
    // billed BELOW card is real information (a negotiated spot rate, or a credit) and
    // clamping it would overstate the net overcharge.
    variance: p ? billed - p.rate : null,
    gap_reason: p ? null : gapReason(card, { transporter: r.transporter_name, vehicleType: r.vehicle_type }),
  }
})

// ── Write ──
await pool.query('DROP TABLE IF EXISTS public.b2b_trip_priced_new')
await pool.query(`
  CREATE TABLE public.b2b_trip_priced_new (
    invoice_id    bigint,
    month_year    text,
    invoice_number text,
    transporter   text,
    origin_raw    text,
    dest_raw      text,
    origin        text,        -- normalised market, for grouping
    dest          text,
    vehicle       text,        -- card vocabulary: 20FT / PICKUP / TATA ACE / 7.5T …
    vehicle_raw   text,
    freight_type  text,
    billed        numeric,
    card_rate     numeric,     -- NULL = no contracted cell for this trip
    match_tier    text,        -- 'exact' | 'market' | NULL
    variance      numeric,     -- billed - card_rate; negative means billed under card
    gap_reason    text         -- why it could not be priced
  )`)

// Batched insert — 1,742 rows is small, but a single statement keeps it one round trip.
const cols = ['invoice_id','month_year','invoice_number','transporter','origin_raw','dest_raw',
  'origin','dest','vehicle','vehicle_raw','freight_type','billed','card_rate','match_tier',
  'variance','gap_reason']
const CHUNK = 400
for (let i = 0; i < priced.length; i += CHUNK) {
  const slice = priced.slice(i, i + CHUNK)
  const vals = [], params = []
  slice.forEach((r, j) => {
    const base = j * cols.length
    vals.push('(' + cols.map((_, k) => `$${base + k + 1}`).join(',') + ')')
    params.push(r.id, r.month_year, r.invoice_number, r.transporter, r.origin_raw, r.dest_raw,
      r.origin, r.dest, r.vehicle, r.vehicle_raw, r.freight_type, r.billed, r.card_rate,
      r.match_tier, r.variance, r.gap_reason)
  })
  await pool.query(`INSERT INTO public.b2b_trip_priced_new (${cols.join(',')}) VALUES ${vals.join(',')}`, params)
}

await pool.query('CREATE INDEX ON public.b2b_trip_priced_new (month_year, transporter)')
await pool.query('CREATE INDEX ON public.b2b_trip_priced_new (origin, dest, vehicle)')
await pool.query('ANALYZE public.b2b_trip_priced_new')

// Swap in one transaction on a single pinned client, so a reader never sees a missing table.
const c = await pool.connect()
try {
  await c.query('BEGIN')
  await c.query('DROP TABLE IF EXISTS public.b2b_trip_priced')
  await c.query('ALTER TABLE public.b2b_trip_priced_new RENAME TO b2b_trip_priced')
  await c.query('COMMIT')
} catch (e) { await c.query('ROLLBACK'); throw e } finally { c.release() }

// ── Report ──
const m = priced.filter(r => r.card_rate != null)
const sum = (a, f) => a.reduce((s, r) => s + f(r), 0)
const billed = sum(m, r => r.billed), cardTot = sum(m, r => r.card_rate)
const allBilled = sum(priced, r => r.billed)
const L = v => '₹' + (v / 1e5).toFixed(2) + 'L'
console.log(`\npriced ${m.length} of ${priced.length} trips  ${(billed / allBilled * 100).toFixed(1)}% of spend`)
console.log(`  billed   ${L(billed)}`)
console.log(`  card     ${L(cardTot)}`)
console.log(`  variance ${L(billed - cardTot)}  (${((billed / cardTot - 1) * 100).toFixed(1)}%)`)
for (const t of ['exact', 'market']) {
  const s = m.filter(r => r.match_tier === t)
  if (s.length) console.log(`  tier ${t.padEnd(7)} ${String(s.length).padStart(4)} trips  variance ${L(sum(s, r => r.variance))}`)
}
const gaps = {}
for (const r of priced.filter(r => r.card_rate == null)) {
  gaps[r.gap_reason] = gaps[r.gap_reason] || { n: 0, rs: 0 }
  gaps[r.gap_reason].n++; gaps[r.gap_reason].rs += r.billed
}
console.log('\ncoverage gap:')
for (const [k, v] of Object.entries(gaps).sort((a, b) => b[1].rs - a[1].rs)) {
  console.log(`  ${String(v.n).padStart(4)} trips  ${L(v.rs).padStart(9)}  ${k}`)
}
await pool.end()
console.log('\nwrote public.b2b_trip_priced')
