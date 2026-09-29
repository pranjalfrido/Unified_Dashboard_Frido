// Delhivery addendum rate card (HQ: FRIDO SURFACE TIER 2 / FRIDO HEAVY, FRIDO NDD
// EXPRESS), transcribed from the contract images.
//
// The contract images are authoritative: where the xlsx rate-card sheet disagrees with
// them, these values win. Validated against live invoices — Surface Forward zone A at
// 0.5 kg prices at ₹20.00 and the ledger's actual average for that cell is ₹20.00.
//
// ZONE LABELS: the contract writes C1/C2 and D1/D2, but the ledger records plain
// C and D. They are the same zones, so both collapse here.
//
// All weights in KILOGRAMS; rates are base freight in INR before COD and GST.

// Tier shape:
//   flat      — rate covering everything up to and including `upTo`
//   addPerKg  — per additional kg above the previous breakpoint, up to `upTo`
//   addPerStep + stepKg — same, but charged per 500 g step
//   breakpoint — the quoted rate AT `upTo` (authoritative at that exact weight)
export const DELHIVERY_RATES = {
  // ── Surface (also serves "Heavy": same rate card per instruction) ──
  Surface: {
    zones: ['A', 'B', 'C', 'D', 'E'],
    tiers: [
      { upTo: 0.5, flat: [20, 21, 28, 31, 44] },
      // "DL addnl 0.5 kg" — one 500 g step from 0.5 to 1 kg.
      { upTo: 1, addPerStep: [17, 18, 23, 25, 31], stepKg: 0.5, from: 0.5, fromRate: [20, 21, 28, 31, 44] },
      // "DL addnl 1kg till 4kgs"
      { upTo: 4, addPerKg: [18, 20, 23, 26, 32], from: 1 },
      { upTo: 5, flat: [90, 98, 117, 130, 167] },
      // "DL addnl 1kgs till 9kgs"
      { upTo: 9, addPerKg: [15, 17, 20, 23, 30], from: 5, fromRate: [90, 98, 117, 130, 167] },
      { upTo: 10, flat: [136, 152, 187, 212, 277] },
      { upTo: 19, addPerKg: [13, 15, 18, 20, 26], from: 10, fromRate: [136, 152, 187, 212, 277] },
      { upTo: 20, flat: [240, 275, 325, 375, 485] },
      { upTo: 29, addPerKg: [12, 14, 15, 20, 26], from: 20, fromRate: [240, 275, 325, 375, 485] },
      { upTo: 30, flat: [348, 401, 460, 555, 719] },
      { upTo: 49, addPerKg: [12, 14, 15, 20, 26], from: 30, fromRate: [348, 401, 460, 555, 719] },
      { upTo: 50, flat: [576, 667, 745, 935, 1213] },
      { upTo: Infinity, addPerKg: [11, 13, 16, 18, 25], from: 50, fromRate: [576, 667, 745, 935, 1213] },
    ],
  },

  // ── NDD Express ──
  // The contract only publishes zones A, B and C. Per the logistics team, there is no
  // D/E Express rate — anything landing in those zones is charged at the C rate. That
  // is handled in normZone() below (D/E -> C for Express only), which is what prices
  // the 15,399 zone-D Express shipments in the ledger.
  // Priced entirely in 500 g steps.
  Express: {
    zones: ['A', 'B', 'C'],
    tiers: [
      { upTo: 0.5, flat: [25, 30, 45] },
      { upTo: Infinity, addPerStep: [20, 21, 20], stepKg: 0.5, from: 0.5, fromRate: [25, 30, 45] },
    ],
  },
}

// RTO = 90% of forward, DTO = 1.45x forward — same rules as the sheet's note.
export const DELHIVERY_MODE_MULTIPLIER = { RTO: 0.90, DTO: 1.45 }

// COD: ₹20 or 1.1% of invoice value, whichever is HIGHER.
export const delhiveryCod = invoiceValue => Math.max(20, 0.011 * (invoiceValue || 0))

export const DELHIVERY_VOLUMETRIC_DIVISOR = 5000

// Ledger zone -> contract zone.
//   C1/C2 and D1/D2 are recorded as plain C/D, so the numeric suffix is dropped.
//   For NDD Express the contract publishes no D/E column; per the logistics team those
//   shipments are charged at the C rate, so D and E fold into C for that service only.
//   Surface keeps its own D and E rates and is never folded.
const normZone = (zone, service) => {
  const s = String(zone || '').trim().toUpperCase()
  const base = s.startsWith('C') ? 'C' : s.startsWith('D') ? 'D' : s
  if (service === 'Express' && (base === 'D' || base === 'E')) return 'C'
  return base
}

// Base freight for one Delhivery shipment, or null when the zone genuinely isn't
// served, so the caller leaves the row unpriced rather than inventing a number.
export function delhiveryBaseRate(service, zone, weightKg) {
  const card = DELHIVERY_RATES[service]
  if (!card) return null
  const zi = card.zones.indexOf(normZone(zone, service))
  if (zi === -1) return null
  const w = Number(weightKg)
  if (!(w > 0)) return null

  let prevBreak = 0
  let prevRate = 0
  for (const t of card.tiers) {
    if (w <= t.upTo) {
      if (t.flat) return t.flat[zi]
      const step = t.addPerStep ? t.stepKg : 1
      const per = t.addPerStep ? t.addPerStep[zi] : t.addPerKg[zi]
      const from = t.from != null ? t.from : prevBreak
      const baseRate = t.fromRate ? t.fromRate[zi] : prevRate
      const steps = Math.ceil(Math.max(0, w - from) / step)
      return baseRate + steps * per
    }
    if (t.upTo !== Infinity) {
      prevBreak = t.upTo
      if (t.flat) prevRate = t.flat[zi]
      else if (t.breakpoint) prevRate = t.breakpoint[zi]
      else if (t.fromRate) {
        // Carry the computed rate at this tier's ceiling forward.
        const step = t.addPerStep ? t.stepKg : 1
        const per = t.addPerStep ? t.addPerStep[zi] : t.addPerKg[zi]
        prevRate = t.fromRate[zi] + Math.ceil((t.upTo - t.from) / step) * per
      }
    }
  }
  const last = card.tiers[card.tiers.length - 1]
  const step = last.addPerStep ? last.stepKg : 1
  const per = last.addPerStep ? last.addPerStep[zi] : last.addPerKg[zi]
  return last.fromRate[zi] + Math.ceil(Math.max(0, w - last.from) / step) * per
}
