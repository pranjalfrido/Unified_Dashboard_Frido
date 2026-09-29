// Bluedart B2B (heavy freight) rate card — the Frido card rates supplied by the user.
//
// Booked in the B2C ledger under courier_name = 'Bluedart B2B' (2,493 rows, ₹31.86 L),
// so it shares that table but must NOT be priced with the B2C Bluedart engine: this is a
// flat ₹/kg card with no weight slabs, where B2C is a slab-and-breakpoint card.
//
// ZONE LETTERS ARE REGIONS HERE, not the B2C distance zones. Bluedart encoded the region
// in the same column:
//   A = West   B = North   C = South   D = East   E = North East / J&K
// The card was given by region name; this maps it back to the letter the ledger stores.
// Cross-checked against invoiced freight ÷ charged weight: A 7.30 vs card 7, E 20.63 vs
// card 20 — the card is the right one.
//
// VOLUMETRIC DIVISOR IS 4500, not the 5000 used for B2C. The B2B contract CFT is 6, so
// billable volumetric weight = L*B*H(cm) / 4500. A smaller divisor yields a HEAVIER
// volumetric weight, so applying the B2C 5000 here would understate what Bluedart is
// entitled to charge and manufacture a false overbilling claim.
//
// NO WEIGHT SLABBING. B2C rounds up to the next kg (0.5 kg floor); this card is per
// actual kg, so the rate applies to the billable weight as-is.

// ₹ per kg by region, keyed on the zone letter the ledger stores.
export const BLUEDART_B2B_RATES = {
  A: 7,      // West
  B: 8.5,    // North
  C: 8.5,    // South
  D: 12,     // East
  E: 20,     // North East / J&K
}

// Region names, for labelling — the letters are meaningless to a reader on their own.
export const BLUEDART_B2B_REGION = {
  A: 'West', B: 'North', C: 'South', D: 'East', E: 'North East / J&K',
}

// The contract's CFT of 6 gives this divisor. Named rather than inlined because the B2C
// engines use 5000 and the two must never be confused.
export const B2B_VOLUMETRIC_DIVISOR = 4500

// Volumetric weight in kg from centimetre dimensions. Returns null when any dimension is
// missing, so a caller can fall back to declared weight instead of treating it as 0 kg.
export function b2bVolumetricKg(lenCm, breCm, heiCm) {
  const l = Number(lenCm), b = Number(breCm), h = Number(heiCm)
  if (!(l > 0) || !(b > 0) || !(h > 0)) return null
  return (l * b * h) / B2B_VOLUMETRIC_DIVISOR
}

// Billable weight is the greater of actual and volumetric — couriers charge on whichever
// favours them, which is the whole point of a volumetric rule.
export function b2bBillableKg(actualKg, lenCm, breCm, heiCm) {
  const actual = Number(actualKg) > 0 ? Number(actualKg) : null
  const vol = b2bVolumetricKg(lenCm, breCm, heiCm)
  if (actual == null && vol == null) return null
  if (vol == null) return actual
  if (actual == null) return vol
  return Math.max(actual, vol)
}

// Freight for a Bluedart B2B shipment. Returns null for an unserved zone rather than 0,
// so an unpriced row is visibly unpriced instead of silently free.
export function bluedartB2bRate(zone, billableKg) {
  const rate = BLUEDART_B2B_RATES[String(zone || '').trim().toUpperCase()]
  if (rate == null) return null
  const kg = Number(billableKg)
  if (!(kg > 0)) return null
  return rate * kg
}
