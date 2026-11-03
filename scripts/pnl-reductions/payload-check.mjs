#!/usr/bin/env node
// Layer-1 parity for PNL_REDUCTIONS_PLAN.md: the shipped P&L reductions / trend packs against the
// P&L page's ORIGINAL row-based expressions (copied verbatim from src/pnl/PnLPage.jsx @ origin/main
// b766ea29), evaluated on the full response as the browser received it (JSON round-tripped).
// Everything must be identical (===, same keys) — no tolerance.
//
//   checkPnlPayload(fullInMemory, pnlPart) → [] or a list of problems
//     fullInMemory  the handler's full (no-phase) payload object, before serialisation
//     pnlPart       a phase response holding <channel>.pnlAgg / .pnlTrend (default: computed here)
//
// Standalone: node scripts/pnl-reductions/payload-check.mjs <full-response.json>
import { readFileSync } from 'fs'
import { pathToFileURL } from 'url'
import { computePnlAgg, computePnlTrend, shopifyNetScaleSums, amazonNetScaleSums, channelNetScaleSums, shopifyRatesBySku, eboRatesBySku, flipkartReturnsBySku, shopifyResolvedTrendRows, shopifyDailySkuRows, dailyPnLRows, adsDailyRows } from '../../api/_pnlAgg.js'

const rt = x => JSON.parse(JSON.stringify(x))

// Strict equality: same keys, same values (=== for primitives, Object.is distinguishes nothing JSON can't carry).
function sameDeep(a, b, path, out) {
  if (a === b) return
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) { out.push(`${path}: ${JSON.stringify(a)?.slice(0, 80)} !== ${JSON.stringify(b)?.slice(0, 80)}`); return }
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length || ka.some(k => !Object.prototype.hasOwnProperty.call(b, k))) { out.push(`${path}: keys differ (${ka.length} vs ${kb.length})`); return }
  for (const k of ka) { sameDeep(a[k], b[k], `${path}.${k}`, out); if (out.length > 20) return }
}

// ── the original expressions (PnLPage.jsx) ──
function origShNetScaleSums(sh, subChKeyForSubCat) {
  const resolvedRows = (sh.resolvedDailySKU || []).filter(x => subChKeyForSubCat ? x.subChannel === subChKeyForSubCat : x.subChannel !== 'shopify international')
  const resolvedGross = resolvedRows.reduce((s, x) => s + (x.gross || 0), 0)
  const resolvedReturnRev = resolvedRows.reduce((s, x) => s + (x.totalReturnRev || 0), 0)
  return { n: resolvedRows.length, gross: resolvedGross, totalReturnRev: resolvedReturnRev }
}
function origResolvedNetScaleSums(resolvedDailySKU) {
  const rows = resolvedDailySKU || []
  const resolvedGross = rows.reduce((s, x) => s + (x.gross || 0), 0)
  const resolvedReturnRev = rows.reduce((s, x) => s + (x.totalReturnRev || 0), 0)
  return { n: rows.length, gross: resolvedGross, totalReturnRev: resolvedReturnRev }
}
function origShResolvedRatesBySku(data, d2cSubCh) {
  const rows = data?.shopify?.resolvedDailySKU
  if (!rows?.length) return {}
  const filtered = d2cSubCh === 'Mobility' ? rows.filter(r => r.subChannel === 'mobility')
    : d2cSubCh === 'MyFrido' ? rows.filter(r => r.subChannel === 'myfrido')
    : rows.filter(r => r.subChannel !== 'shopify international')
  const bySku = {}
  filtered.forEach(r => {
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
function origEboResolvedRatesBySku(data) {
  const rows = data?.ebo?.resolvedDailySKU
  if (!rows?.length) return {}
  const bySku = {}
  rows.forEach(r => {
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
function origFkReturns(fk) {
  const fkReturnRevBySku = {}, fkReturnedUnitsBySku = {}
  ;(fk.dailyPnLBySku || []).forEach(x => {
    fkReturnRevBySku[x.sku] = (fkReturnRevBySku[x.sku] || 0) + (x.totalReturnRev || 0)
    fkReturnedUnitsBySku[x.sku] = (fkReturnedUnitsBySku[x.sku] || 0) + (x.returnedUnits || 0)
  })
  return { returnRev: fkReturnRevBySku, returnedUnits: fkReturnedUnitsBySku }
}
// The rows each trend loop reads, as the loops read them (shDailySndBySku skips !sku || !units).
const pickFields = (rows, fields) => rows.map(r => Object.fromEntries(fields.filter(f => r[f] !== undefined).map(f => [f, r[f]])))
const resolvedView = r => ({ date: r.date, sku: r.sku, subChannel: r.subChannel, units: r.units, gross: r.gross, rto: r.components?.rto?.units || 0, cir: r.components?.cir?.units || 0, cancel: r.components?.cancel?.units || 0, exch: r.components?.exchange?.units || 0 })

export function checkPnlPayload(fullMem, pnlPart) {
  const problems = []
  const full = rt(fullMem) // what the browser parsed before this change
  const part = pnlPart ? rt(pnlPart) : rt(Object.fromEntries(Object.entries(computePnlAgg(fullMem)).map(([ch, a]) => [ch, { pnlAgg: a }])))
  if (!pnlPart) for (const [ch, t] of Object.entries(computePnlTrend(fullMem))) (part[ch] ||= {}).pnlTrend = rt(t)
  // the new code reads `part` merged onto fast (no rows)
  const d = {}
  for (const ch of ['shopify', 'ebo', 'amzSC', 'amzVC', 'amzVCMatrix', 'flipkart', 'cred', 'firstcry', 'myntra', 'ads']) d[ch] = { ...(part[ch] || {}) }
  const eq = (label, a, b) => sameDeep(a, b, label, problems)

  for (const [k, sub] of [['notIntl', null], ['myfrido', 'myfrido'], ['mobility', 'mobility']]) eq(`shopify.netScale.${k}`, shopifyNetScaleSums(d.shopify, k), origShNetScaleSums(full.shopify || {}, sub))
  eq('amazon.netScale.sc', amazonNetScaleSums(d, 'sc'), origResolvedNetScaleSums(full.amzSC?.resolvedDailySKU || []))
  eq('amazon.netScale.vc', amazonNetScaleSums(d, 'vc'), origResolvedNetScaleSums(full.amzVC?.resolvedDailySKU || []))
  eq('amazon.netScale.all', amazonNetScaleSums(d, 'all'), origResolvedNetScaleSums((full.amzSC?.resolvedDailySKU || []).concat(full.amzVC?.resolvedDailySKU || [])))
  for (const ch of ['ebo', 'flipkart', 'cred', 'firstcry', 'myntra']) eq(`${ch}.netScale`, channelNetScaleSums(d[ch]), origResolvedNetScaleSums(full[ch]?.resolvedDailySKU))
  for (const [k, sub] of [['notIntl', 'all'], ['myfrido', 'MyFrido'], ['mobility', 'Mobility']]) eq(`shopify.ratesBySku.${k}`, shopifyRatesBySku(d.shopify, k), origShResolvedRatesBySku(full, sub))
  eq('ebo.ratesBySku', eboRatesBySku(d.ebo), origEboResolvedRatesBySku(full))
  eq('flipkart.returnsBySku', flipkartReturnsBySku(d.flipkart), origFkReturns(full.flipkart || {}))

  // trend packs: same rows, same order, same values for every field the trend loops read
  if (d.shopify.pnlTrend) {
    eq('pnlTrend.shopify.resolved', shopifyResolvedTrendRows(d.shopify).map(resolvedView), (full.shopify?.resolvedDailySKU || []).filter(r => r.sku && r.units).map(resolvedView))
    eq('pnlTrend.shopify.dailySKU', pickFields(shopifyDailySkuRows(d.shopify), ['date', 'sku', 'subChannel', 'units', 'returnUnits', 'rev', 'excRev', 'cancelRev', 'rtoRev', 'cirRev', 'returnRev', 'returnedUnits']),
      pickFields(full.shopify?.dailySKU || [], ['date', 'sku', 'subChannel', 'units', 'returnUnits', 'rev', 'excRev', 'cancelRev', 'rtoRev', 'cirRev', 'returnRev', 'returnedUnits']))
    const DP = ['date', 'sku', 'gross', 'excRev', 'net', 'totalReturnRev', 'units', 'returnedUnits', 'snd']
    for (const ch of ['amzSC', 'amzVCMatrix', 'flipkart']) eq(`pnlTrend.${ch}.daily`, pickFields(dailyPnLRows(d[ch]), DP), pickFields(full[ch]?.dailyPnLBySku || [], DP))
    const PLAT = new Set(['Amazon', 'Flipkart', 'Meta', 'Google'])
    eq('pnlTrend.ads.daily', pickFields(adsDailyRows(d.ads), ['date', 'platform', 'spend']), pickFields((full.ads?.adsDailyByCategory || []).filter(x => PLAT.has(x.platform)), ['date', 'platform', 'spend']))
  }
  // and the rows fallback (static pnl-data*.json, no reductions) is the original computation itself
  eq('fallback.shopify.netScale.notIntl', shopifyNetScaleSums(full.shopify, 'notIntl'), origShNetScaleSums(full.shopify || {}, null))
  eq('fallback.shopify.ratesBySku.mobility', shopifyRatesBySku(full.shopify, 'mobility'), origShResolvedRatesBySku(full, 'Mobility'))
  eq('fallback.amazon.netScale.all', amazonNetScaleSums(full, 'all'), origResolvedNetScaleSums((full.amzSC?.resolvedDailySKU || []).concat(full.amzVC?.resolvedDailySKU || [])))
  return problems
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const full = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  const t0 = Date.now()
  const p = checkPnlPayload(full)
  console.log(p.length ? `FAIL\n${p.join('\n')}` : `PASS: P&L reductions and trend packs identical to the original row expressions (${Date.now() - t0} ms)`)
  process.exit(p.length ? 1 : 0)
}
