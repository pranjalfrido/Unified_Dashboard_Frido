import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Weight-slab logistics/fulfilment rate card — same file the frontend loads for Shopify's SnD
// (public/snd-rates.json). 500 rows, {weightGm, forward, rto, reverse, fulfilment}, sorted
// ascending by weightGm. Extracted here (rather than living privately in api/bq.js) so both
// api/bq.js and standalone Node scripts (e.g. scripts/generate-flipkart-snd-ratecard.mjs) can
// share one copy instead of re-implementing the same weight-slab lookup a third time.
let sndRateSlabs = null
export function loadSndRateSlabs() {
  if (sndRateSlabs) return sndRateSlabs
  try {
    const p = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'snd-rates.json')
    sndRateSlabs = JSON.parse(readFileSync(p, 'utf8'))
  } catch { sndRateSlabs = [] }
  return sndRateSlabs
}

// Courier billing convention: round UP to the first slab whose weightGm >= the order's actual
// weight (never the slab below it) — matches PnLPage.jsx's rateForWeight for Shopify.
export function rateForWeight(slabs, weightGm) {
  if (!slabs.length) return null
  for (const s of slabs) if (s.weightGm >= weightGm) return s
  return slabs[slabs.length - 1]
}

// Flipkart SnD rate card (public/flipkart-snd-ratecard.json) — precomputed monthly, at
// (month, category, subcategory, fulfillmentType) grain, by scripts/generate-flipkart-snd-ratecard.mjs.
// See that script's header comment for full methodology/provenance.
let fkSndRatecard = null
export function loadFkSndRatecard() {
  if (fkSndRatecard) return fkSndRatecard
  try {
    const p = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'flipkart-snd-ratecard.json')
    fkSndRatecard = JSON.parse(readFileSync(p, 'utf8'))
  } catch { fkSndRatecard = { months: [], cells: [], categoryFallback: [], meta: {} } }
  return fkSndRatecard
}

// Resolves an all-in SnD% for a given (month, category, subcategory, fulfillmentType), applying
// the confirmed 3-rung fallback chain — never fabricates a rate:
//   1. Exact cell for this month+subcategory+fulfillmentType, if it meets the minimum order count.
//   2. Else the nearest EARLIER month's cell for the same subcategory+fulfillmentType (walking
//      backward through the ratecard's own `months` list) that meets the threshold.
//   3. Else this month's (or nearest earlier month's) category-level blended fallback rate.
//   4. Else null — caller must leave that SKU/month uncosted, same as Amazon's sndBySku does for
//      any SKU it has no data for; never guess.
// Returns { pct, source } where source is 'exact' | 'prior-month' | 'category-fallback' | null,
// so callers/debugging can tell which rung actually got used.
export function resolveFkRate(ratecard, month, category, subcategory, fulfillmentType, minOrderCount) {
  const threshold = minOrderCount ?? ratecard?.meta?.minOrderCountThreshold ?? 15
  const cells = ratecard?.cells || []
  const months = ratecard?.months || []
  const categoryFallback = ratecard?.categoryFallback || []

  const cellsBySubcatFt = cells.filter(c => c.subcategory === subcategory && c.fulfillmentType === fulfillmentType)

  const exact = cellsBySubcatFt.find(c => c.month === month)
  if (exact && exact.orderCount >= threshold) return { pct: exact.allInExpensePct, source: 'exact' }

  const priorMonths = months.filter(m => m < month).sort().reverse()
  for (const m of priorMonths) {
    const hit = cellsBySubcatFt.find(c => c.month === m)
    if (hit && hit.orderCount >= threshold) return { pct: hit.allInExpensePct, source: 'prior-month' }
  }

  const catCellsForMonth = categoryFallback.filter(c => c.category === category)
  const exactCat = catCellsForMonth.find(c => c.month === month)
  if (exactCat) return { pct: exactCat.blendedAllInExpensePct, source: 'category-fallback' }
  for (const m of priorMonths) {
    const hit = catCellsForMonth.find(c => c.month === m)
    if (hit) return { pct: hit.blendedAllInExpensePct, source: 'category-fallback' }
  }

  return { pct: null, source: null }
}
