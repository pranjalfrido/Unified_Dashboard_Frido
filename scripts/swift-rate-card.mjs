// Swift addendum rate card, transcribed from the contract PDF.
//
// WHY THIS EXISTS SEPARATELY FROM THE XLSX:
// The flat sheet stores one rate per discrete weight slab, but Swift's contract is
// expressed as "breakpoint rate + ₹X per additional kg up to the next breakpoint".
// Those two shapes are not interchangeable:
//   * the sheet only holds the slabs someone chose to enumerate, so 47,658 ledger rows
//     fell outside it and got no rate at all;
//   * the sheet's Swift numbers also disagree with the addendum (sheet has zone A @
//     0.5 kg = ₹24, the addendum says ₹19.92), and the addendum is what reproduces the
//     invoices — so the addendum wins.
// Encoding the breakpoint structure prices ANY weight, including the long tail.
//
// All weights here are KILOGRAMS. Rates are base freight in INR, before fuel surcharge,
// COD and GST — those are handled by the caller.

// Each service is a list of tiers, ascending by `upTo` (kg):
//   flat    — the rate that covers everything up to and including this breakpoint
//   addPerKg / addStep — cost of each additional step ABOVE the previous breakpoint,
//                        charged up to this breakpoint
// A tier with `flat` sets the price at its breakpoint; a tier with `addPerKg` prices
// the range between the previous breakpoint and this one.
export const SWIFT_RATES = {
  // ── Surface · Forward ──
  'Forward - Surface': {
    zones: ['A', 'B', 'C', 'D', 'E'],
    tiers: [
      { upTo: 0.5, flat: [19.92, 23.24, 26.56, 30.71, 43.16] },
      { upTo: 1, flat: [37.35, 45.65, 51.46, 59.76, 86.32] },
      { upTo: 3, addPerKg: [12.45, 13.28, 19.92, 20.75, 25.73], breakpoint: [58.10, 70.55, 89.64, 99.60, 136.12] },
      { upTo: 5, addPerKg: [11.62, 12.45, 18.26, 19.09, 24.07], breakpoint: [79.68, 93.79, 113.71, 131.14, 182.60] },
      { upTo: 7, addPerKg: [11.62, 12.45, 16.60, 17.43, 22.41], breakpoint: [102.92, 118.69, 146.55, 165.66, 220.78] },
      { upTo: 10, addPerKg: [10.79, 11.62, 14.11, 14.11, 20.75], breakpoint: [128.65, 145.25, 184.26, 197.54, 273.90] },
      { upTo: 15, addPerKg: [9.96, 9.96, 9.96, 10.79, 18.26], breakpoint: [177.77, 194.35, 233.79, 251.05, 364.50] },
      { upTo: 20, addPerKg: [9.96, 9.96, 9.96, 10.79, 16.60], breakpoint: [227.57, 243.30, 283.12, 304.70, 444.05] },
      { upTo: 40, addPerKg: [8.30, 8.30, 8.30, 9.13, 16.60], breakpoint: [392.91, 409.30, 448.80, 486.81, 776.05] },
      // Above 40 kg the contract continues at a flat per-additional-kg rate.
      { upTo: Infinity, addPerKg: [9.96, 10.79, 10.79, 10.79, 12.45], from: 40, fromRate: [392.91, 409.30, 448.80, 486.81, 776.05] },
    ],
  },

  // ── Surface · Reverse (also used for RVP) ──
  'Reverse - Surface': {
    zones: ['A', 'B', 'C', 'D', 'E'],
    tiers: [
      { upTo: 0.5, flat: [38.21, 42.46, 46.71, 49.25, 52.65] },
      { upTo: 1, flat: [57.74, 66.24, 73.88, 80.67, 88.32] },
      { upTo: 2, flat: [70.48, 78.97, 84.07, 95.96, 119.74] },
      { upTo: 5, addPerKg: [18.68, 21.23, 22.93, 24.63, 34.82], breakpoint: [118.89, 136.72, 152.89, 169.48, 204.65] },
      { upTo: 10, addPerKg: [14.44, 15.29, 16.98, 19.53, 33.23], breakpoint: [182, 203, 226, 253, 343] },
      { upTo: 15, addPerKg: [10.00, 10.50, 11.00, 12.00, 20.00], breakpoint: [230, 253, 279, 311, 441] },
      { upTo: 20, addPerKg: [10.00, 10.50, 11.00, 12.00, 20.00], breakpoint: [278, 304, 332, 369, 539] },
      { upTo: Infinity, addPerKg: [11.04, 11.89, 12.74, 14.44, 28.02], from: 20, fromRate: [278, 304, 332, 369, 539] },
    ],
  },

  // ── NDD (regional) ──
  // Additional charge below 2 kg is per 500 g, not per kg.
  'NDD - Regional': {
    zones: ['A', 'B', 'C', 'D', 'E'],
    tiers: [
      { upTo: 0.5, flat: [25.0, 27.0, 38.0, 45.0, 53.0] },
      { upTo: 2, addPerStep: [16.0, 17.0, 18.0, 18.0, 37.0], stepKg: 0.5, breakpoint: [50.0, 55.0, 65.0, 70.0, 93.0] },
      { upTo: 5, addPerKg: [11.0, 11.5, 20.0, 29.0, 60.0], breakpoint: [75.0, 80.0, 124.0, 155.0, 270.0] },
      { upTo: 10, addPerKg: [10.0, 12.0, 20.0, 24.0, 55.0], breakpoint: [125.0, 135.0, 220.0, 270.0, 510.0] },
      { upTo: Infinity, addPerKg: [10.0, 12.0, 20.0, 24.0, 40.0], from: 10, fromRate: [125.0, 135.0, 220.0, 270.0, 510.0] },
    ],
  },

  // ── SDD ──
  // Zone A only; the contract lists NA for B–E, so those must not be priced.
  'SDD': {
    zones: ['A'],
    tiers: [
      { upTo: 0.5, flat: [30.37] },
      { upTo: 1, flat: [47.95] },
      { upTo: 3, addPerKg: [13.67], breakpoint: [72.36] },
      { upTo: 5, addPerKg: [13.67], breakpoint: [99.70] },
      { upTo: Infinity, addPerKg: [13.67], from: 5, fromRate: [99.70] },
    ],
  },
}

// Fuel surcharge steps on Surface and Reverse, by monthly picked volume.
export const SWIFT_FUEL_TIERS = [
  [20000, 0.205], [40000, 0.08], [75000, 0.024], [100000, 0.012], [Infinity, 0],
]
export const swiftFuelPct = monthlyPicked =>
  SWIFT_FUEL_TIERS.find(([cap]) => monthlyPicked <= cap)[1]

// COD: ₹24 or 1.1% of invoice value, whichever is HIGHER.
export const swiftCod = invoiceValue => Math.max(24, 0.011 * (invoiceValue || 0))

export const SWIFT_VOLUMETRIC_DIVISOR = 5000

// Base freight for one Swift shipment. Returns null when the zone isn't served
// (e.g. SDD outside zone A) so the caller can leave the row unpriced rather than
// invent a number.
export function swiftBaseRate(service, zone, weightKg) {
  const card = SWIFT_RATES[service]
  if (!card) return null
  const zi = card.zones.indexOf(zone)
  if (zi === -1) return null
  const w = Number(weightKg)
  if (!(w > 0)) return null

  let prevBreak = 0
  for (const t of card.tiers) {
    if (w <= t.upTo) {
      // Flat tier: the breakpoint rate covers everything up to it.
      if (t.flat) return t.flat[zi]
      // Stepped tier: breakpoint rate, or interpolate from the previous breakpoint.
      const step = t.addPerStep ? t.stepKg : 1
      const per = t.addPerStep ? t.addPerStep[zi] : t.addPerKg[zi]
      // At or above the tier's own breakpoint, use the quoted breakpoint rate.
      if (t.breakpoint && w >= t.upTo) return t.breakpoint[zi]
      // Otherwise charge the previous breakpoint plus whole steps above it.
      const baseRate = t.fromRate ? t.fromRate[zi] : prevBreakRate(card, t, zi)
      const from = t.from != null ? t.from : prevBreak
      const steps = Math.ceil(Math.max(0, w - from) / step)
      return baseRate + steps * per
    }
    prevBreak = t.upTo === Infinity ? prevBreak : t.upTo
  }
  // Beyond every finite tier: last tier handles it via `from`/`fromRate`.
  const last = card.tiers[card.tiers.length - 1]
  const per = last.addPerKg[zi]
  const steps = Math.ceil(Math.max(0, w - last.from) / 1)
  return last.fromRate[zi] + steps * per
}

// The rate quoted at the breakpoint immediately below this tier.
function prevBreakRate(card, tier, zi) {
  const i = card.tiers.indexOf(tier)
  for (let k = i - 1; k >= 0; k--) {
    const t = card.tiers[k]
    if (t.flat) return t.flat[zi]
    if (t.breakpoint) return t.breakpoint[zi]
  }
  return 0
}
