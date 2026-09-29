// Parses the semicolon-delimited `remarks` blob on logistics_invoices_b2c into real
// columns (spec §3.4). These values exist nowhere else in the schema.
//
// Writes only rmk_* columns. Never touches costs, weights, awb_number or anything else.
//
//   node scripts/parse-remarks.mjs --dry-run
//   node scripts/parse-remarks.mjs
//
// Observed format (keys vary by courier, ~11% of rows have no remarks at all):
//   status Delivered; GST 12.06; COD amt 948; svc EXF2608512
//   discount 4.89; GST 11.7; weight dispute 0 - Under weight charged; svc CAH703511
//   status Delivered; direction FORWARD; Cost incl GST 32.09; SwiftId 502254KX...; state Karnataka

import pkg from 'pg'
import { config } from 'dotenv'

config()
const { Pool } = pkg

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const PAGE = 5000
const WRITE_CHUNK = 500

const connStr = process.env.SUPABASE_URL
if (!connStr) { console.error('SUPABASE_URL not set'); process.exit(1) }
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, max: 3 })
pool.on('error', e => console.error('[pool]', e.message))

// ── Field extractors ─────────────────────────────────────────────────────────
// Each is anchored to its key and stops at the next semicolon, so a value containing
// spaces (state names, dispute text) survives intact.
const seg = (s, key) => {
  const m = s.match(new RegExp(`(?:^|;)\\s*${key}\\s*([^;]*)`, 'i'))
  return m ? m[1].trim() : null
}
const numOf = v => {
  if (v == null) return null
  // Values arrive as "12.06", "0 - Under weight charged", "948". Take the leading number.
  const m = String(v).match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = parseFloat(m[0])
  return isFinite(n) ? n : null
}

function parseRemarks(raw) {
  const s = String(raw || '').trim()
  if (!s) return null

  // "Cost incl GST 32.09" and "GST 12.06" both exist; prefer the explicit GST amount.
  const gstSeg = seg(s, 'Cost incl GST') ?? seg(s, 'GST')
  // Courier reference appears as `svc XXX` (most couriers) or `SwiftId XXX`.
  const ref = seg(s, 'svc') ?? seg(s, 'SwiftId')

  const status = seg(s, 'status')
  const dispute = seg(s, 'weight dispute')

  return {
    status: status || null,
    direction: seg(s, 'direction') || null,
    gst: numOf(gstSeg),
    discount: numOf(seg(s, 'discount')),
    codAmt: numOf(seg(s, 'COD amt')),
    state: seg(s, 'state') || null,
    ref: ref || null,
    // Keep the dispute text verbatim — "Wrong weight charged" vs "Under weight charged"
    // are opposite findings and the wording is the courier's own admission.
    dispute: dispute || null,
  }
}

// ── Walk the ledger ──────────────────────────────────────────────────────────
const stats = {
  seen: 0, parsed: 0, noRemarks: 0, written: 0,
  status: 0, direction: 0, gst: 0, discount: 0, cod: 0, state: 0, ref: 0, dispute: 0,
}
const statusCounts = {}
const disputeCounts = {}
const pending = []
const stamp = new Date().toISOString()

async function flush(chunk) {
  const vals = []
  const params = []
  chunk.forEach((c, k) => {
    const b = k * 9
    vals.push(`($${b + 1}::bigint,$${b + 2}::text,$${b + 3}::text,$${b + 4}::numeric,$${b + 5}::numeric,$${b + 6}::numeric,$${b + 7}::text,$${b + 8}::text,$${b + 9}::text)`)
    params.push(c.id, c.status, c.direction, c.gst, c.discount, c.codAmt, c.state, c.ref, c.dispute)
  })
  await pool.query(`
    UPDATE public.logistics_invoices_b2c AS t
       SET rmk_delivery_status = v.status,
           rmk_direction       = v.direction,
           rmk_gst             = v.gst,
           rmk_discount        = v.discount,
           rmk_cod_amt         = v.cod_amt,
           rmk_dest_state      = v.state,
           rmk_courier_ref     = v.ref,
           rmk_weight_dispute  = v.dispute,
           rmk_parsed_at       = '${stamp}'
      FROM (VALUES ${vals.join(',')})
        AS v(id, status, direction, gst, discount, cod_amt, state, ref, dispute)
     WHERE t.id = v.id
  `, params)
}

console.log(DRY ? 'DRY RUN — nothing will be written\n' : 'Parsing remarks…\n')

let lastId = 0
for (;;) {
  const { rows } = await pool.query(
    `SELECT id, remarks FROM public.logistics_invoices_b2c
      WHERE id > $1 ORDER BY id ASC LIMIT ${PAGE}`, [lastId]
  )
  if (!rows.length) break

  for (const r of rows) {
    stats.seen++
    lastId = r.id
    const p = parseRemarks(r.remarks)
    if (!p) { stats.noRemarks++; continue }
    stats.parsed++
    if (p.status) { stats.status++; statusCounts[p.status] = (statusCounts[p.status] || 0) + 1 }
    if (p.direction) stats.direction++
    if (p.gst != null) stats.gst++
    if (p.discount != null) stats.discount++
    if (p.codAmt != null) stats.cod++
    if (p.state) stats.state++
    if (p.ref) stats.ref++
    if (p.dispute) {
      stats.dispute++
      // Normalise for the summary only; the stored value stays verbatim.
      const k = p.dispute.replace(/^-?\d+(?:\.\d+)?\s*-?\s*/, '').trim() || '(no text)'
      disputeCounts[k] = (disputeCounts[k] || 0) + 1
    }
    pending.push({ id: r.id, ...p })
  }

  if (!DRY) {
    while (pending.length >= WRITE_CHUNK) {
      await flush(pending.splice(0, WRITE_CHUNK))
      stats.written += WRITE_CHUNK
      process.stdout.write(`\r  scanned ${stats.seen.toLocaleString('en-IN')} · written ${stats.written.toLocaleString('en-IN')}`)
    }
  } else {
    pending.length = 0
    process.stdout.write(`\r  scanned ${stats.seen.toLocaleString('en-IN')}`)
  }

  if (rows.length < PAGE) break
}

if (!DRY && pending.length) {
  for (let i = 0; i < pending.length; i += WRITE_CHUNK) {
    const chunk = pending.slice(i, i + WRITE_CHUNK)
    await flush(chunk)
    stats.written += chunk.length
  }
}
process.stdout.write('\n')

const pct = n => `${(n / stats.seen * 100).toFixed(1)}%`
console.log(`\n${DRY ? '[DRY RUN]' : '[WRITTEN]'}  ${stats.seen.toLocaleString('en-IN')} rows scanned`)
console.log(`  with remarks         ${stats.parsed.toLocaleString('en-IN')} (${pct(stats.parsed)})`)
console.log(`  no remarks           ${stats.noRemarks.toLocaleString('en-IN')} (${pct(stats.noRemarks)})`)
if (!DRY) console.log(`  rows updated         ${stats.written.toLocaleString('en-IN')}`)
console.log()
console.log('  extracted field coverage:')
for (const [k, v] of [
  ['delivery_status', stats.status], ['direction', stats.direction],
  ['gst', stats.gst], ['discount', stats.discount], ['cod_amt', stats.cod],
  ['dest_state', stats.state], ['courier_ref', stats.ref], ['weight_dispute', stats.dispute],
]) console.log(`    ${k.padEnd(16)}${String(v).padStart(8)}  (${pct(v)})`)

console.log()
console.log('  delivery_status values:')
for (const [k, v] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${k.padEnd(22)}${v.toLocaleString('en-IN')}`)
}
console.log()
console.log('  weight_dispute wording (the courier\'s own admission):')
for (const [k, v] of Object.entries(disputeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${k.padEnd(38)}${v.toLocaleString('en-IN')}`)
}

if (DRY) console.log('\n  Re-run without --dry-run to write rmk_* columns.')
await pool.end()
