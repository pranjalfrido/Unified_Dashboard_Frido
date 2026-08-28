// B2B contracted rate card — Jopadevi & Reliable, from the signed rate sheet.
//
// GRAIN: transporter x from x to x vehicle size. 147 sheet rows -> 443 priced cells across
// 7 vehicle columns (10FT..32FT).
//
// WHY THIS MATTERS: without the card, a lane could only be compared against its own history.
// That looked reassuring — most lanes bill an identical amount every month, which reads as a
// well-honoured contract. Against the actual card those flat rates are flat ABOVE it. Only
// the contract catches that.
//
// MATCHING IS TIERED, and the tier is reported with every row, because the tiers are not
// equally arguable in a dispute:
//
//   tier 1 "exact"      the card names these very locations (44.7% of spend). The rate is
//                       the contracted rate for that lane. Unarguable.
//   tier 2 "market"     the invoice location is a satellite that the card prices under a
//                       different nearby name, so the lane is matched on the normalised
//                       market (21.2%). Defensible but the transporter can argue the
//                       specific drop point.
//   unmatched           no card cell exists (34.1%) — mostly vehicle types the card does
//                       not cover (PICKUP/7.5T/10MT) and three transporters with no card
//                       at all. Reported as a COVERAGE GAP, never as zero variance.
//
// Tier 2 takes the MINIMUM card rate when several card lanes collapse onto one market
// (43 of 320 normalised cells are built from more than one rate). Minimum is the honest
// choice for the CARD side of the comparison: it is the cheapest rate the transporter
// themselves published for that market, so claiming against it says "you had a rate this
// low for this market" — a floor we can defend rather than an average we invented.

import XLSX from 'xlsx'
import { normalizeLocation } from './b2b-locations.mjs'

export const CARD_VEHICLES = ['10FT', '14FT', '17FT', '20FT', '22FT', '24FT', '32FT']

// Ledger vehicle_type is free text: "20 FT", "20FT", "20 Ft", "Pickup/10 Ft", "TRUCK 7 .5T".
// Reduced to the card's vocabulary. Vehicles the card does not price return their own token
// (PICKUP / 7.5T / 10MT) so they land in the coverage gap rather than being force-matched.
export function vehicleKey(vt) {
  const s = String(vt || '').toUpperCase().replace(/\s+/g, '')
  // "PICKUP/10FT" is a pickup, not a 10FT truck — check pickup BEFORE the footage pattern,
  // or the digits inside the string capture it as the wrong (and much dearer) vehicle.
  //
  // Tata Ace is kept SEPARATE from PICKUP. On the same lane it is consistently the cheaper
  // vehicle — Pune>Mumbai ₹5,800 vs ₹7,800, Pune>Pune ₹2,800 vs ₹3,200 — so folding the two
  // would compare a small van against a pickup's rate and invent variance.
  if (/ACE/.test(s)) return 'TATA ACE'
  if (/PICK/.test(s)) return 'PICKUP'
  if (/7\.?5T?/.test(s)) return '7.5T'
  if (/10MT|10T\b/.test(s)) return '10MT'
  const m = s.match(/(\d+)\s*FT/)
  if (m) return m[1] + 'FT'
  return s || null
}

// Punctuation- and case-insensitive location key, so "BHAJGHERA, GURGAON" in the ledger
// matches "BHAJGHERA,GURGAON" on the card without going through normalisation.
const rawKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Load the sheet into two lookups: exact raw-location cells, and normalised-market cells.
export function loadB2bCard(path) {
  const wb = XLSX.readFile(path)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
  const exact = new Map()
  const market = new Map()
  let cells = 0
  for (const r of rows) {
    const tn = String(r['Courier partner'] || '').trim()
    if (!tn) continue
    for (const v of CARD_VEHICLES) {
      const raw = r[v]
      if (raw == null) continue
      // "-" and blanks mean "not served with this vehicle", not a zero rate.
      const n = Number(String(raw).replace(/[^0-9.]/g, ''))
      if (!(n > 0)) continue
      cells++
      exact.set([tn, rawKey(r.FROM), rawKey(r.TO), v].join('|'), n)
      const mk = [tn, normalizeLocation(r.FROM), normalizeLocation(r.TO), v].join('|')
      // Minimum across collapsed lanes — see the header note on why minimum.
      if (!market.has(mk) || n < market.get(mk)) market.set(mk, n)
    }
  }
  return { exact, market, cells, sheetRows: rows.length }
}

// Price one invoice row. Returns the tier so the UI can separate unarguable rupees from
// arguable ones, and null when no cell exists so the caller reports a gap rather than 0.
export function priceTrip(card, { transporter, origin, destination, vehicleType }) {
  const tn = String(transporter || '').trim()
  const v = vehicleKey(vehicleType)
  if (!tn || !v) return null
  const e = card.exact.get([tn, rawKey(origin), rawKey(destination), v].join('|'))
  if (e != null) return { rate: e, tier: 'exact', vehicle: v }
  const m = card.market.get([tn, normalizeLocation(origin), normalizeLocation(destination), v].join('|'))
  if (m != null) return { rate: m, tier: 'market', vehicle: v }
  return null
}

// Why a trip could not be priced — so the coverage gap is explained, not just counted.
export function gapReason(card, { transporter, vehicleType }) {
  const tn = String(transporter || '').trim()
  const hasTransporter = [...card.exact.keys()].some(k => k.startsWith(tn + '|'))
  if (!hasTransporter) return 'no card for this transporter'
  const v = vehicleKey(vehicleType)
  if (!CARD_VEHICLES.includes(v)) return `card does not price ${v || 'this vehicle'}`
  return 'lane not on card'
}
