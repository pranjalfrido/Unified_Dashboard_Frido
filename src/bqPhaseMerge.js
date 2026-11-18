// Staged loading of /api/bq (api/_bqPhases.js): the page first asks for phase 'fast', then for the
// detail group(s) the open tab needs ('sales_detail' / 'pnl_detail' / 'ads_detail'). Each detail
// response holds only its own fields — top-level keys, or one key inside a per-channel object
// (shopify, amzSC, ads, …) — and is merged into the fast object here, two levels deep, so every
// component keeps reading the same `data.x` / `data.shopify.y` shape as the old single response.
// Also used by scripts/staged-loading/*.mjs to prove fast + all detail groups == the full response.

export const BQ_CHANNEL_OBJECTS = new Set(['shopify', 'flipkart', 'blinkit', 'instamart', 'zepto', 'cred', 'firstcry', 'myntra', 'amzSC', 'amzVCMatrix', 'amzVC', 'amzIntl', 'ebo', 'offline', 'international', 'ads'])

// Merge order when assembling cached groups: pnl_margin before pnl_detail, so where both are cached
// the P&L page reads its own group's copy of the fields they share.
export const DETAIL_PHASES = ['sales_detail', 'pnl_margin', 'pnl_detail', 'ads_detail']

// Which detail group each page needs on top of 'fast'. Intelligence reads only fast fields.
export const PAGE_DETAIL_PHASES = {
  overview: ['sales_detail'], // category / state / product sections
  sales: ['sales_detail'],
  pnl: ['pnl_detail'],
  // Ads also renders a hidden P&L probe (PnLPage summaryOnly) for each product's breakeven ROAS,
  // which reads only the small pnl_margin group — both requested in parallel.
  ads: ['ads_detail', 'pnl_margin'],
  intelligence: [],
}

// A group whose fields (and P&L reductions) are all inside another: once the larger one is cached or
// merged, the smaller one is ready without a request of its own.
export const PHASE_COVERED_BY = { pnl_margin: 'pnl_detail' }

// Returns a new object; never mutates `base` or `part`.
export function mergePhase(base, part) {
  if (!base) return { ...(part || {}) }
  const out = { ...base }
  for (const [k, v] of Object.entries(part || {})) {
    if (BQ_CHANNEL_OBJECTS.has(k) && v && typeof v === 'object' && !Array.isArray(v)
      && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = { ...out[k], ...v }
    } else {
      out[k] = v
    }
  }
  return out
}
