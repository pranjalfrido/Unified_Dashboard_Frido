// Prices every B2C ledger row against the rate card and writes what Frido SHOULD
// have been billed, so the dashboard can compare it to what the courier actually
// charged.
//
// Writes these columns (nothing else is touched):
//   frido_billed_cost  — what the card says the shipment SHOULD cost, priced on OUR
//                        declared weight. This is the entitlement figure.
//   frido_addl_charges — surcharge + other_charge carried over from the invoice
//   frido_total_cost   — frido_billed_cost + frido_addl_charges
//   frido_carrier_cost — the card rate priced on the COURIER's charged weight. Proves
//                        the card itself is right, and isolates weight inflation as the
//                        cause of any gap vs frido_billed_cost.
//
// WHY TWO BASES: validated against 6.3 lakh live invoices, pricing on the courier's
// charged weight reproduces the invoice freight to within -0.5% overall — so the card
// and the service mapping are correct. Pricing the same shipments on our own declared
// weight comes out 6.2% lower. That delta is not a modelling error; it IS the
// overbilling, because the courier is charging for weight we did not ship.
//
//   node scripts/price-ledger.mjs --dry-run
//   node scripts/price-ledger.mjs
//
// Requires (run once in the Supabase SQL editor):
//   ALTER TABLE public.logistics_invoices_b2c
//     ADD COLUMN IF NOT EXISTS frido_billed_cost  NUMERIC,
//     ADD COLUMN IF NOT EXISTS frido_addl_charges NUMERIC,
//     ADD COLUMN IF NOT EXISTS frido_total_cost   NUMERIC,
//     ADD COLUMN IF NOT EXISTS frido_rate_service TEXT,
//     ADD COLUMN IF NOT EXISTS frido_priced_at    TIMESTAMPTZ;
//   GRANT SELECT, UPDATE ON public.logistics_invoices_b2c TO service_role;

import pkg from 'pg'
import { config } from 'dotenv'
import { swiftBaseRate } from './swift-rate-card.mjs'
import { delhiveryBaseRate } from './delhivery-rate-card.mjs'

config()
const { Pool } = pkg

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')

// ── Billing rules ────────────────────────────────────────────────────────────
// Billable slab: 0.5 kg minimum, then round UP to the next whole kg. The rate card
// is keyed on these slabs, so we look up the first slab >= the shipment's weight.
//
// Reverse-leg multipliers (per the rate card's own notes):
//   RTO = 90% of forward, DTO = 1.45x forward.
// Applied to the FORWARD rate because the card prices forward only for most services.
//
// Reverse / RVP are NOT multiplied: Swift and Ekart have dedicated reverse cards
// (resolveService routes them there), so a multiplier would double-count. Bluedart
// has no reverse card and falls back to its forward rate at 1.0x — flagged in the
// report as `reverseNoCard` so that assumption stays visible rather than silent.
const MODE_MULTIPLIER = { RTO: 0.90, DTO: 1.45 }

// Carriers whose reverse legs price off a dedicated card entry (Reverse - Surface /
// Returns - Large), so they need no adjustment on top of the card rate.
const HAS_REVERSE_CARD = new Set(['Swift', 'Ekart'])

// Bluedart has no reverse card: RVP = forward rate + a flat ₹33 pickup fee.
// Additive, not multiplicative — a flat fee doesn't scale with the slab.
const BLUEDART_RVP_FLAT = 33

// ── SkyAir: a different contract shape entirely ───────────────────────────────
// SkyAir isn't in the rate-card sheet. Its addendum prices on MONTHLY SHIPMENT
// VOLUME, not zone/weight slabs:
//   base price covers up to 1 kg, then ₹10 per additional kg
//   COD adds ₹10 per shipment
//   RTO is charged the same as forward (no multiplier)
//   flat rates override the table for the heavy/volumetric SKUs below
// Volume tiers are (max shipments per month, base price).
const SKYAIR_TIERS = [[1500, 47], [2500, 45], [3500, 43], [5000, 40], [7000, 39], [9000, 38], [Infinity, 37]]
const skyairBase = monthlyVolume => SKYAIR_TIERS.find(([cap]) => monthlyVolume <= cap)[1]
const SKYAIR_COD_FEE = 10
const SKYAIR_ADDL_PER_KG = 10
// Flat per-shipment rates for volumetric SKUs, and the per-kg rate above 27 kg.
const SKYAIR_FLAT_22_5 = 155      // "Mattress 1" (22.5 kg volumetric)
const SKYAIR_FLAT_27 = 170        // "Mattress 2" (27 kg volumetric)
const SKYAIR_ABOVE_27_PER_KG = 4.75

// Prices one SkyAir shipment. `volume` is that month's total SkyAir shipment count.
function priceSkyAir({ weightKg, volume, isCod }) {
  const w = weightKg > 0 ? weightKg : 1
  let base
  if (w > 27) {
    // Above 27 kg the contract switches to a per-kg rate.
    base = w * SKYAIR_ABOVE_27_PER_KG
  } else if (w > 22.5) {
    base = SKYAIR_FLAT_27
  } else if (w === 22.5) {
    base = SKYAIR_FLAT_22_5
  } else {
    // Volume-tier base covers the first 1 kg; every additional kg is ₹10.
    base = skyairBase(volume) + Math.max(0, Math.ceil(w - 1)) * SKYAIR_ADDL_PER_KG
  }
  // COD collection fee applies regardless of which base above was used.
  return base + (isCod ? SKYAIR_COD_FEE : 0)
}

// Ledger courier_name -> rate-card carrier. The two spell several carriers
// differently ("ElasticRun" vs "Elastic Run", "Urbanbolt" vs "Urban Bolt").
const CARRIER_MAP = {
  Bluedart: 'Bluedart',
  Swift: 'Swift',
  Delhivery: 'Delhivery',
  ElasticRun: 'Elastic Run',
  Shadowfax: 'Shadowfax',
  Urbanbolt: 'Urban Bolt',
  Ekart: 'Ekart',
  // SkyAir intentionally absent: it is priced by priceSkyAir() from its own addendum,
  // which is volume-based rather than zone/slab-based.
}

// Equivalences confirmed by the logistics team:
//   Reverse == RVP        — both are reverse shipments, one rate treatment
//   NDD     == Express    — same service tier, so they share a card entry
// These are not cosmetic: 19,658 rows are reverse-family and 87,651 are
// NDD/Express-family, so mapping either one wrong misprices a large slice.
const isReverseMode = m => ['REVERSE', 'RVP'].includes(String(m || '').trim().toUpperCase())
const isExpressTier = a => ['ndd', 'express', 'regional ndd'].includes(String(a || '').trim().toLowerCase())

// (carrier, account_type, mode) -> rate-card service.
// Account types are lower-cased and trimmed so "Surface" and "SURFACE" both hit.
// Delhivery Heavy shares Surface rates, per instruction.
function resolveService(carrier, acct, mode) {
  const a = String(acct || '').trim().toLowerCase()
  const reverse = isReverseMode(mode) || a === 'rvp'
  const express = isExpressTier(a)

  switch (carrier) {
    case 'Bluedart':
      // Confirmed: Dart Plus IS Bluedart Surface, so it prices off the B2C - Surface
      // card — that covers 313,068 rows / ~49% of the ledger. Air Etail and RVP have
      // no separate card either, so every B2C Bluedart service uses this entry.
      return 'B2C - Surface'
    case 'Delhivery':
      // Heavy is charged at Surface rates; NDD and Express are the same tier.
      // Names match the contract engine's keys.
      return express ? 'Express' : 'Surface'
    case 'Swift':
      // SDD is its own zone-A-only card; NDD/Express share the regional card.
      if (a === 'sdd') return 'SDD'
      if (express) return 'NDD - Regional'
      return reverse ? 'Reverse - Surface' : 'Forward - Surface'
    case 'Ekart':
      return reverse ? 'Returns - Large' : 'Forward - Large'
    case 'Shadowfax':
      // Prime Small / Prime Large map onto the card's Small / Large.
      return a.includes('small') ? 'Small' : 'Large'
    case 'Elastic Run':
      // Card has NDD and SDD; NDD absorbs Express/Regional NDD.
      return a === 'sdd' ? 'SDD' : 'NDD'
    case 'Urban Bolt':
      return express ? 'Express' : 'Surface'
    default:
      return null
  }
}

const connStr = process.env.SUPABASE_URL
if (!connStr) { console.error('SUPABASE_URL not set'); process.exit(1) }
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, max: 3 })
pool.on('error', e => console.error('[pool]', e.message))

// ── Load the rate card into memory (39k rows — small) ──
// Keyed carrier|service|zone -> slabs sorted ascending, so pricing is a binary search
// for the first slab >= weight rather than a per-row round trip to Postgres.
console.log('Loading rate card…')
const { rows: card } = await pool.query(
  'SELECT carrier, service, slab_kg::float8 AS slab, zone, rate::float8 AS rate FROM public.logistics_rate_card'
)
if (!card.length) {
  console.error('logistics_rate_card is empty — run scripts/import-rate-card.mjs first.')
  process.exit(1)
}
const CARD = new Map()
for (const r of card) {
  const k = `${r.carrier}|${r.service}|${r.zone}`
  if (!CARD.has(k)) CARD.set(k, [])
  CARD.get(k).push({ slab: r.slab, rate: r.rate })
}
for (const arr of CARD.values()) arr.sort((a, b) => a.slab - b.slab)
console.log(`  ${card.length.toLocaleString('en-IN')} rates across ${CARD.size.toLocaleString('en-IN')} carrier/service/zone keys`)

// ── Rate resolution: contract engines first, sheet as fallback ────────────────
// Swift and Delhivery have signed addenda whose structure the flat sheet cannot
// express (breakpoint + additional-per-kg rather than one rate per enumerated slab).
// Those engines are authoritative — validated 27/27 breakpoints against the contract
// images — and they price ANY weight, which is what clears the 47,658 rows the sheet
// had no slab for. Every other carrier still uses the sheet.
//
// The engines take the RAW weight (not a rounded slab) because they do their own
// stepping internally; the sheet path still needs the slab rounding.
function contractRate(carrier, service, zone, weightKg) {
  if (carrier === 'Swift') return swiftBaseRate(service, zone, weightKg)
  if (carrier === 'Delhivery') return delhiveryBaseRate(service, zone, weightKg)
  return undefined   // undefined = "no contract engine", distinct from null = "not served"
}

// First slab at or above the shipment weight — standard courier rounding.
function lookupRate(carrier, service, zone, weightKg) {
  const arr = CARD.get(`${carrier}|${service}|${zone}`)
  if (!arr) return null
  let lo = 0, hi = arr.length - 1, ans = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid].slab >= weightKg) { ans = arr[mid]; hi = mid - 1 } else lo = mid + 1
  }
  // Heavier than the card's top slab: fall back to the heaviest slab rather than
  // dropping the row, and count it so the report shows how often this happens.
  if (!ans) { ans = arr[arr.length - 1]; return { rate: ans.rate, overTop: true } }
  return { rate: ans.rate, overTop: false }
}

const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }

// Weights are kilograms for every courier as of the Aug 2026 reupload, so there is no
// gram normalisation here any more — it must stay in step with api/logistics-cost.js or
// the frido_* columns would disagree with the dashboard that reads them.
//
// A ceiling still applies: an earlier partial conversion left rows claiming "139,840 kg",
// which would look up the heaviest slab on the card and badly misprice them. Anything
// above this is physically impossible for a parcel courier, so it is left unpriced
// rather than priced wrongly.
const MAX_PLAUSIBLE_PARCEL_KG = 500

// 0.5 kg minimum, then round UP to the next whole kg.
// The comparison is <= 0.5, not < 0.5: a shipment of exactly 0.5 kg belongs in the
// 0.5 slab. With a strict <, ceil(0.5) pushed it to the 1 kg slab and over-priced
// 173,220 Bluedart rows (~30% of the ledger), which showed up as Bluedart apparently
// under-charging by 17%.
const billableSlab = w => (w > 0 ? (w <= 0.5 ? 0.5 : Math.ceil(w)) : null)

// SkyAir's base price depends on that month's shipment volume, so the tier has to be
// known before any row is priced.
const { rows: syVol } = await pool.query(`
  SELECT month_year, COUNT(*)::int AS n
    FROM public.logistics_invoices_b2c
   WHERE courier_name = 'SkyAir' GROUP BY 1
`)
const SKYAIR_VOLUME = Object.fromEntries(syVol.map(r => [r.month_year, Number(r.n)]))
if (syVol.length) {
  console.log('  SkyAir monthly volume → base price:')
  for (const [m, n] of Object.entries(SKYAIR_VOLUME).sort()) {
    console.log(`    ${m}  ${String(n).padStart(6)} shipments → ₹${skyairBase(n)} base`)
  }
}

// ── Walk the ledger ──
const PAGE = 5000
const stats = {
  seen: 0, priced: 0, noCarrier: 0, noService: 0, noRate: 0, noWeight: 0, badZone: 0, overTop: 0,
  reverseNoCard: 0, bluedartRvp: 0, skyair: 0, sumActualFreight: 0, sumCarrierCost: 0,
  implausibleWeight: 0,
  viaContract: 0, viaSheet: 0, zoneNotServed: 0,
  sumBilled: 0, sumAddl: 0, sumActual: 0, byCourier: {},
}
const sample = []
let lastId = 0
const pending = []
const stamp = new Date().toISOString()

for (;;) {
  const { rows: batch } = await pool.query(`
    SELECT id, courier_name, courier_account_type, shipment_mode, zone, month_year, payment_mode,
           declared_weight_frido::float8 AS dw, charged_weight_courier::float8 AS cw,
           total_cost::float8 AS actual, freight_charge::float8 AS freight,
           surcharge::float8 AS surcharge, other_charge::float8 AS other
      FROM public.logistics_invoices_b2c
     WHERE id > $1 ORDER BY id ASC LIMIT ${PAGE}
  `, [lastId])
  if (!batch.length) break

  for (const r of batch) {
    stats.seen++
    lastId = r.id

    // Weight first — every pricing path needs it. Read as stored (all kilograms now);
    // fall back to the courier's charged weight only when we never recorded our own.
    let wKg = num(r.dw)
    if (!(wKg > 0)) wKg = num(r.cw)

    // Physically impossible weights would look up the card's heaviest slab and produce a
    // wildly wrong price, so leave them unpriced instead.
    if (wKg > MAX_PLAUSIBLE_PARCEL_KG || num(r.cw) > MAX_PLAUSIBLE_PARCEL_KG) {
      stats.implausibleWeight++
      continue
    }

    // SkyAir is priced off its own volume-based addendum, not the rate-card sheet,
    // so it short-circuits the carrier/service/zone lookup entirely.
    if (r.courier_name === 'SkyAir') {
      if (!(wKg > 0)) { stats.noWeight++; continue }
      const base = priceSkyAir({
        weightKg: wKg,
        volume: SKYAIR_VOLUME[r.month_year] || 0,
        isCod: String(r.payment_mode || '').trim().toUpperCase() === 'COD',
      })
      stats.priced++; stats.skyair++
      stats.sumBilled += base
      stats.sumActual += num(r.actual)
      stats.sumActualFreight += num(r.freight)
      // SkyAir prices on shipment count, not weight, so entitlement and control are
      // identical — but both must still be accumulated, or the carrier totals go NaN.
      stats.sumCarrierCost += base
      const bc = (stats.byCourier[r.courier_name] ??= { n: 0, expected: 0, carrier: 0, actual: 0 })
      bc.n++; bc.expected += base; bc.carrier += base; bc.actual += num(r.freight)
      // SkyAir prices off shipment count, not weight, so both bases are the same.
      pending.push({ id: r.id, base: +base.toFixed(2), addl: 0, total: +base.toFixed(2), carrierCost: +base.toFixed(2), service: 'SkyAir addendum' })
      continue
    }

    const carrier = CARRIER_MAP[r.courier_name]
    if (!carrier) { stats.noCarrier++; continue }
    const service = resolveService(carrier, r.courier_account_type, r.shipment_mode)
    if (!service) { stats.noService++; continue }
    if (!['A', 'B', 'C', 'D', 'E'].includes(r.zone)) { stats.badZone++; continue }

    // Two prices per shipment, from the same card:
    //   slab      — our declared weight  → what we SHOULD have been billed
    //   slabChg   — courier charged wt   → what the card justifies at their weight
    const slab = billableSlab(wKg)
    if (!slab) { stats.noWeight++; continue }

    const cwKgNorm = num(r.cw)
    const slabChg = billableSlab(cwKgNorm)

    // Contract engine first (Swift/Delhivery), sheet otherwise.
    //
    // BOTH paths get the SLAB, not the raw weight. The engines step per additional kg
    // above a breakpoint, so a raw 4.7 kg accrues partial-kg steps and prices ₹137.78
    // where the billable 5 kg slab prices ₹131.14 — i.e. raw input silently overstated
    // the entitlement on ~4 in 14 weights. Couriers bill on slabs, so slabs are what
    // the card must be asked about, and this now matches the API's slab-based gap.
    const cRate = contractRate(carrier, service, r.zone, slab)
    let rate, rateChg
    if (cRate !== undefined) {
      // A contract engine exists for this carrier.
      if (cRate == null) { stats.zoneNotServed++; continue }   // e.g. SDD outside zone A
      stats.viaContract++
      rate = cRate
      rateChg = slabChg ? contractRate(carrier, service, r.zone, slabChg) : null
    } else {
      const hit = lookupRate(carrier, service, r.zone, slab)
      if (!hit) { stats.noRate++; continue }
      if (hit.overTop) stats.overTop++
      stats.viaSheet++
      rate = hit.rate
      const hitChg = slabChg ? lookupRate(carrier, service, r.zone, slabChg) : null
      rateChg = hitChg ? hitChg.rate : null
    }

    const mode = String(r.shipment_mode || '').trim().toUpperCase()
    const mult = MODE_MULTIPLIER[mode] ?? 1
    let base = rate * mult

    // Bluedart reverse: forward rate + flat ₹33. Applied here rather than as an
    // "additional charge" because it is part of the freight rate, not an invoice extra.
    const reverseLeg = isReverseMode(mode) || String(r.courier_account_type || '').trim().toLowerCase() === 'rvp'
    if (reverseLeg && carrier === 'Bluedart') {
      base += BLUEDART_RVP_FLAT
      stats.bluedartRvp++
    } else if (reverseLeg && !HAS_REVERSE_CARD.has(carrier)) {
      // Some other carrier with no reverse card — priced at forward, flagged so the
      // assumption stays visible in the report.
      stats.reverseNoCard++
    }
    // The invoice's total_cost ALREADY includes surcharge + other_charge (verified: for
    // most carriers freight_charge == total_cost, and Bluedart's
    // total − freight − surcharge − other residual is ~0). So frido_total_cost carries
    // the surcharges the courier actually levied on top of OUR expected base rate,
    // making frido_total_cost directly comparable to the invoice total.
    const addl = num(r.surcharge) + num(r.other)
    const total = base + addl

    // Same rules applied at the courier's charged weight — the control figure.
    const carrierCost = rateChg != null
      ? rateChg * mult + (reverseLeg && carrier === 'Bluedart' ? BLUEDART_RVP_FLAT : 0)
      : null

    stats.priced++
    stats.sumBilled += base
    stats.sumAddl += addl
    stats.sumActual += num(r.actual)
    stats.sumActualFreight += num(r.freight)
    if (carrierCost != null) stats.sumCarrierCost += carrierCost
    const bc = (stats.byCourier[r.courier_name] ??= { n: 0, expected: 0, carrier: 0, actual: 0 })
    // Compare base-to-base: our card rate vs the invoice's own freight line.
    bc.n++; bc.expected += base; bc.actual += num(r.freight)
    if (carrierCost != null) bc.carrier += carrierCost

    if (sample.length < 12) {
      sample.push({ courier: r.courier_name, service, zone: r.zone, w: wKg.toFixed(2), slab, mode,
        mult, base: base.toFixed(2), addl: addl.toFixed(2), total: total.toFixed(2), actual: num(r.actual).toFixed(2) })
    }

    pending.push({
      id: r.id, base: +base.toFixed(2), addl: +addl.toFixed(2), total: +total.toFixed(2),
      carrierCost: carrierCost != null ? +carrierCost.toFixed(2) : null, service,
    })
  }

  if (!DRY) {
    while (pending.length >= 2000) await flush(pending.splice(0, 2000))
  }
  process.stdout.write(`\r  scanned ${stats.seen.toLocaleString('en-IN')} · priced ${stats.priced.toLocaleString('en-IN')}`)
}
if (!DRY) while (pending.length) await flush(pending.splice(0, 2000))
process.stdout.write('\n')

// Bulk UPDATE ... FROM a VALUES list — one statement per 2000 rows.
async function flush(chunk) {
  const vals = []
  const params = []
  chunk.forEach((c, k) => {
    const b = k * 6
    vals.push(`($${b + 1}::bigint,$${b + 2}::numeric,$${b + 3}::numeric,$${b + 4}::numeric,$${b + 5}::numeric,$${b + 6}::text)`)
    params.push(c.id, c.base, c.addl, c.total, c.carrierCost, c.service)
  })
  await pool.query(`
    UPDATE public.logistics_invoices_b2c AS t
       SET frido_billed_cost = v.base, frido_addl_charges = v.addl,
           frido_total_cost = v.total, frido_carrier_cost = v.carrier_cost,
           frido_rate_service = v.service, frido_priced_at = '${stamp}'
      FROM (VALUES ${vals.join(',')}) AS v(id, base, addl, total, carrier_cost, service)
     WHERE t.id = v.id
  `, params)
}

// ── Report ──
const f = v => '₹' + Math.round(v).toLocaleString('en-IN')
console.log(`\n${DRY ? '[DRY RUN — nothing written]' : '[WRITE COMPLETE]'}`)
console.log(`  rows seen            ${stats.seen.toLocaleString('en-IN')}`)
console.log(`  priced               ${stats.priced.toLocaleString('en-IN')} (${(stats.priced / stats.seen * 100).toFixed(1)}%)`)
console.log(`  no rate card carrier ${stats.noCarrier.toLocaleString('en-IN')}`)
console.log(`  no service mapping   ${stats.noService.toLocaleString('en-IN')}`)
console.log(`  zone not A–E         ${stats.badZone.toLocaleString('en-IN')}`)
console.log(`  implausible weight   ${stats.implausibleWeight.toLocaleString('en-IN')} (over ${MAX_PLAUSIBLE_PARCEL_KG} kg)`)
console.log(`  no usable weight     ${stats.noWeight.toLocaleString('en-IN')}`)
console.log(`  no rate for slab     ${stats.noRate.toLocaleString('en-IN')}`)
console.log(`  zone not served      ${stats.zoneNotServed.toLocaleString('en-IN')} (contract lists NA for that zone)`)
console.log(`  priced via contract  ${stats.viaContract.toLocaleString('en-IN')} (Swift / Delhivery addenda)`)
console.log(`  priced via sheet     ${stats.viaSheet.toLocaleString('en-IN')} (xlsx rate card)`)
console.log(`  above card top slab  ${stats.overTop.toLocaleString('en-IN')} (priced at heaviest slab)`)
console.log(`  Bluedart RVP (+₹${BLUEDART_RVP_FLAT})  ${stats.bluedartRvp.toLocaleString('en-IN')}`)
console.log(`  reverse on fwd card  ${stats.reverseNoCard.toLocaleString('en-IN')} (carrier has no reverse card)`)
console.log()
console.log('  ENTITLEMENT — card priced on OUR declared weight:')
console.log(`    base freight        ${f(stats.sumBilled)}`)
console.log(`    + addl charges      ${f(stats.sumAddl)}`)
console.log(`    = frido_total_cost  ${f(stats.sumBilled + stats.sumAddl)}`)
console.log()
console.log("  CONTROL — same card priced on the COURIER's charged weight:")
console.log(`    frido_carrier_cost  ${f(stats.sumCarrierCost)}`)
console.log(`    invoice freight     ${f(stats.sumActualFreight)}`)
const ctlDiff = stats.sumActualFreight - stats.sumCarrierCost
console.log(`    control variance    ${f(ctlDiff)}  (${(ctlDiff / stats.sumCarrierCost * 100).toFixed(1)}% — near zero confirms card + mapping)`)
console.log()
const weightGap = stats.sumCarrierCost - stats.sumBilled
console.log(`  WEIGHT INFLATION      ${f(weightGap)}  (${(weightGap / stats.sumBilled * 100).toFixed(1)}%)`)
console.log('    = charged for weight we did not ship')
console.log()
console.log('  by courier (priced rows only):')
for (const [k, v] of Object.entries(stats.byCourier).sort((a, b) => b[1].actual - a[1].actual)) {
  const ctrl = v.carrier ? ((v.actual - v.carrier) / v.carrier * 100).toFixed(1) + '%' : 'n/a'
  const infl = v.expected ? ((v.carrier - v.expected) / v.expected * 100).toFixed(1) + '%' : 'n/a'
  console.log(`    ${k.padEnd(11)} ${String(v.n).padStart(7)}  entitled ${f(v.expected).padStart(11)}  their-wt ${f(v.carrier).padStart(11)}  invoice ${f(v.actual).padStart(11)}  ctrl ${ctrl.padStart(7)}  infl ${infl.padStart(7)}`)
}
console.log()
console.log('  sample:')
console.log('    courier     service              zn  wt    slab  mode     ×     base     addl    total    actual')
for (const s of sample) {
  console.log(`    ${s.courier.padEnd(11)} ${s.service.padEnd(20)} ${s.zone}   ${s.w.padStart(5)} ${String(s.slab).padStart(5)} ${s.mode.padEnd(8)} ${String(s.mult).padStart(4)} ${s.base.padStart(8)} ${s.addl.padStart(7)} ${s.total.padStart(8)} ${s.actual.padStart(9)}`)
}
if (DRY) console.log('\n  Re-run without --dry-run to write frido_* columns.')

await pool.end()
