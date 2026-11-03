// What the P&L page reads from the per-SKU-per-day row arrays, without shipping the rows
// (PNL_REDUCTIONS_PLAN.md). At YTD those arrays were ~215 MB of the 268 MB pnl_detail response.
//
//   <channel>.pnlAgg    whole-range reductions: the net-revenue-scale sums (row count, Σ gross,
//                       Σ totalReturnRev), the per-SKU resolved units/gross that D2C and EBO SnD are
//                       priced from, and Flipkart's per-SKU returns. Shipped with pnl_detail and (for
//                       the channels Ads needs) pnl_margin.
//   <channel>.pnlTrend  the rows the day-wise trend lines genuinely need (per-row COGS by SKU × month
//                       × row ASP, per-row D2C SnD), packed column-wise with only the fields read.
//                       Shipped with pnl_detail only.
//
// Shared by both sides so the numbers are bit-identical: api/_bqPhases.js builds them from the full
// payload; src/pnl/PnLPage.jsx reads them through the helpers at the bottom, which compute the same
// thing from the rows whenever rows are present instead (the static pnl-data*.json files and any
// no-phase response still carry rows). Every accumulator starts at 0, adds in row order and uses the
// exact expression PnLPage.jsx used on the rows (including its `|| 0`), so a reduction === the value
// computed from the rows. Packed values are plain JSON numbers/strings, which round-trip exactly.

// ── reductions ───────────────────────────────────────────────────────────────────────────────────

// D2C sub-channel views: Overall (India, not International), MyFrido, Mobility.
const SH_VARIANTS = {
  notIntl: r => r.subChannel !== 'shopify international',
  myfrido: r => r.subChannel === 'myfrido',
  mobility: r => r.subChannel === 'mobility',
}

// Net-revenue scale inputs (PnLPage resolvedNetScale / shNetScale).
export function netScaleSums(rows) {
  let n = 0, gross = 0, totalReturnRev = 0
  for (const x of rows || []) {
    n++
    gross = gross + (x.gross || 0)
    totalReturnRev = totalReturnRev + (x.totalReturnRev || 0)
  }
  return { n, gross, totalReturnRev }
}

// Per-SKU resolved units / gross / outcome units (PnLPage shResolvedRatesBySku / eboResolvedRatesBySku).
export function resolvedRatesBySku(rows) {
  const bySku = {}
  ;(rows || []).forEach(r => {
    const e = bySku[r.sku] || (bySku[r.sku] = { units: 0, gross: 0, rtoUnits: 0, cirUnits: 0, cancelUnits: 0, exchUnits: 0 })
    e.units += r.units || 0
    e.gross += r.gross || 0
    e.rtoUnits += r.components?.rto?.units || 0
    e.cirUnits += r.components?.cir?.units || 0
    e.cancelUnits += r.components?.cancel?.units || 0
    e.exchUnits += r.components?.exchange?.units || 0
  })
  return bySku
}

// Flipkart per-SKU returns from dailyPnLBySku (PnLPage fkReturnRevBySku / fkReturnedUnitsBySku).
export function fkReturnsBySku(rows) {
  const returnRev = {}, returnedUnits = {}
  ;(rows || []).forEach(x => {
    returnRev[x.sku] = (returnRev[x.sku] || 0) + (x.totalReturnRev || 0)
    returnedUnits[x.sku] = (returnedUnits[x.sku] || 0) + (x.returnedUnits || 0)
  })
  return { returnRev, returnedUnits }
}

export const PNL_AGG_CHANNELS = ['shopify', 'ebo', 'amzSC', 'flipkart', 'cred', 'firstcry', 'myntra']

// { <channel>: pnlAgg } for the given channels, from a full payload's rows.
export function computePnlAgg(payload, channels = PNL_AGG_CHANNELS) {
  const rowsOf = ch => payload[ch]?.resolvedDailySKU || []
  const out = {}
  for (const ch of channels) {
    if (ch === 'shopify') {
      const rows = rowsOf('shopify')
      const netScale = {}, ratesBySku = {}
      for (const [v, keep] of Object.entries(SH_VARIANTS)) {
        const rs = rows.filter(keep)
        netScale[v] = netScaleSums(rs)
        ratesBySku[v] = resolvedRatesBySku(rs)
      }
      out.shopify = { netScale, ratesBySku }
    } else if (ch === 'amzSC') {
      // Amazon's net-revenue scale reads SC rows, VC rows, or SC rows followed by VC rows as one
      // sequence (amzChannelView all) — not SC sum + VC sum, which can differ in the last bit.
      const sc = rowsOf('amzSC'), vc = payload.amzVC?.resolvedDailySKU || []
      out.amzSC = { netScale: { sc: netScaleSums(sc), vc: netScaleSums(vc), all: netScaleSums(sc.concat(vc)) } }
    } else if (ch === 'ebo') {
      out.ebo = { netScale: netScaleSums(rowsOf('ebo')), ratesBySku: resolvedRatesBySku(rowsOf('ebo')) }
    } else if (ch === 'flipkart') {
      out.flipkart = { netScale: netScaleSums(rowsOf('flipkart')), returnsBySku: fkReturnsBySku(payload.flipkart?.dailyPnLBySku) }
    } else {
      out[ch] = { netScale: netScaleSums(rowsOf(ch)) }
    }
  }
  return out
}

// ── trend packs ──────────────────────────────────────────────────────────────────────────────────
// Column-wise: { n, cols: { field: [...] }, dict: { field: [distinct strings] }, absent: { field: [i] } }.
// String fields are stored as indexes into dict; `absent` lists rows where the field was missing
// (as opposed to null), so unpacked rows have exactly the original keys.

function packRows(rows, fields, strings) {
  const cols = {}, dict = {}, idx = {}, absent = {}
  for (const f of fields) cols[f] = []
  for (const f of strings) { dict[f] = []; idx[f] = new Map() }
  rows.forEach((r, i) => {
    for (const f of fields) {
      const v = r[f]
      if (v === undefined) (absent[f] ||= []).push(i)
      if (idx[f]) {
        if (v === undefined) { cols[f].push(-1); continue }
        let k = idx[f].get(v)
        if (k === undefined) { k = dict[f].length; dict[f].push(v); idx[f].set(v, k) }
        cols[f].push(k)
      } else cols[f].push(v === undefined ? null : v)
    }
  })
  return { n: rows.length, cols, dict, absent }
}

const unpacked = new WeakMap()
export function unpackRows(p, build) {
  if (unpacked.has(p)) return unpacked.get(p)
  const fields = Object.keys(p.cols)
  const absent = {}
  for (const [f, list] of Object.entries(p.absent || {})) absent[f] = new Set(list)
  const rows = new Array(p.n)
  for (let i = 0; i < p.n; i++) {
    const r = {}
    for (const f of fields) {
      if (absent[f]?.has(i)) continue
      const c = p.cols[f][i]
      r[f] = p.dict[f] ? p.dict[f][c] : c
    }
    rows[i] = build ? build(r) : r
  }
  unpacked.set(p, rows)
  return rows
}

const DAILY_PNL_FIELDS = ['date', 'sku', 'gross', 'excRev', 'net', 'totalReturnRev', 'units', 'returnedUnits', 'snd']
const SH_DAILY_SKU_FIELDS = ['date', 'sku', 'subChannel', 'units', 'returnUnits', 'rev', 'excRev', 'cancelRev', 'rtoRev', 'cirRev']
const SH_RESOLVED_FIELDS = ['date', 'sku', 'subChannel', 'units', 'gross', 'rtoUnits', 'cirUnits', 'cancelUnits', 'exchUnits']
const ADS_DAILY_PLATFORMS = new Set(['Amazon', 'Flipkart', 'Meta', 'Google'])

// { <channel>: pnlTrend } from a full payload.
export function computePnlTrend(payload) {
  const dailyPnl = rows => packRows(rows || [], DAILY_PNL_FIELDS, ['date', 'sku'])
  // D2C day-wise SnD reads only rows with a SKU and units (it skips the rest after the sub-channel
  // filter, so dropping them here first leaves the same rows in the same order).
  const shResolved = (payload.shopify?.resolvedDailySKU || []).filter(r => r.sku && r.units).map(r => ({
    date: r.date, sku: r.sku, subChannel: r.subChannel, units: r.units, gross: r.gross,
    rtoUnits: r.components?.rto?.units, cirUnits: r.components?.cir?.units,
    cancelUnits: r.components?.cancel?.units, exchUnits: r.components?.exchange?.units,
  }))
  return {
    shopify: {
      resolved: packRows(shResolved, SH_RESOLVED_FIELDS, ['date', 'sku', 'subChannel']),
      dailySKU: packRows(payload.shopify?.dailySKU || [], SH_DAILY_SKU_FIELDS, ['date', 'sku', 'subChannel']),
    },
    amzSC: { daily: dailyPnl(payload.amzSC?.dailyPnLBySku) },
    amzVCMatrix: { daily: dailyPnl(payload.amzVCMatrix?.dailyPnLBySku) },
    flipkart: { daily: dailyPnl(payload.flipkart?.dailyPnLBySku) },
    ads: { daily: packRows((payload.ads?.adsDailyByCategory || []).filter(x => ADS_DAILY_PLATFORMS.has(x.platform)), ['date', 'platform', 'spend'], ['date', 'platform']) },
  }
}

// ── frontend helpers: the reduction / pack when shipped, else the same computation on the rows ──

const sumsOf = (agg, rows) => agg || netScaleSums(rows)

// D2C net-revenue scale sums for a sub-channel view ('notIntl' | 'myfrido' | 'mobility').
export function shopifyNetScaleSums(sh, variant) {
  return sumsOf(sh?.pnlAgg?.netScale?.[variant], (sh?.resolvedDailySKU || []).filter(SH_VARIANTS[variant]))
}

// Amazon net-revenue scale sums for amzChannelView ('all' | 'sc' | 'vc').
export function amazonNetScaleSums(data, view) {
  const agg = data?.amzSC?.pnlAgg?.netScale?.[view]
  if (agg) return agg
  return netScaleSums((view !== 'vc' ? (data?.amzSC?.resolvedDailySKU || []) : []).concat(view !== 'sc' ? (data?.amzVC?.resolvedDailySKU || []) : []))
}

// EBO / Flipkart / CRED / Firstcry / Myntra net-revenue scale sums.
export function channelNetScaleSums(ch) {
  return sumsOf(ch?.pnlAgg?.netScale, ch?.resolvedDailySKU)
}

export function shopifyRatesBySku(sh, variant) {
  const agg = sh?.pnlAgg?.ratesBySku?.[variant]
  if (agg) return agg
  const rows = sh?.resolvedDailySKU
  return rows?.length ? resolvedRatesBySku(rows.filter(SH_VARIANTS[variant])) : {}
}

export function eboRatesBySku(ebo) {
  const agg = ebo?.pnlAgg?.ratesBySku
  if (agg) return agg
  const rows = ebo?.resolvedDailySKU
  return rows?.length ? resolvedRatesBySku(rows) : {}
}

export function flipkartReturnsBySku(fk) {
  return fk?.pnlAgg?.returnsBySku || fkReturnsBySku(fk?.dailyPnLBySku)
}

// Day-wise rows for the trend lines.
const withComponents = r => ({
  date: r.date, sku: r.sku, subChannel: r.subChannel, units: r.units, gross: r.gross,
  components: { rto: { units: r.rtoUnits }, cir: { units: r.cirUnits }, cancel: { units: r.cancelUnits }, exchange: { units: r.exchUnits } },
})
// D2C resolved rows (date, sku, subChannel, units, gross, components.*.units) for day-wise SnD.
export function shopifyResolvedTrendRows(sh) {
  const p = sh?.pnlTrend?.resolved
  return p ? unpackRows(p, withComponents) : (sh?.resolvedDailySKU || [])
}
export function shopifyDailySkuRows(sh) {
  const p = sh?.pnlTrend?.dailySKU
  return p ? unpackRows(p) : (sh?.dailySKU || [])
}
// amzSC / amzVCMatrix / flipkart dailyPnLBySku rows.
export function dailyPnLRows(ch) {
  const p = ch?.pnlTrend?.daily
  return p ? unpackRows(p) : (ch?.dailyPnLBySku || [])
}
// ads.adsDailyByCategory rows (the pack holds only Amazon / Flipkart / Meta / Google — the P&L
// trend lines filter to those platforms anyway).
export function adsDailyRows(ads) {
  const p = ads?.pnlTrend?.daily
  return p ? unpackRows(p) : (ads?.adsDailyByCategory || [])
}
