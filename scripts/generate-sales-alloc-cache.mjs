// Runs in GitHub Actions — fetches sales/item master/inv/sku-mapping from BQ,
// replicates all JS aggregation from api/sales-allocation.js (without any filters),
// writes public/sales-alloc-data.json for CDN delivery.

import { readFileSync } from 'fs'
import { writeFileSync } from 'fs'
import { BigQuery } from '@google-cloud/bigquery'

// ── helpers (inlined from api/sales-allocation.js) ──────────────────────────
import {
  buildFacilityMaps, norm, normSku, cleanLabel, computeRowInventory,
  isPseudoSku, buildSkuMap, resolveMasterSkuKey, sortByLocationOrder, salesTypeFor,
} from '../api/_inventory_shared.js'

const num = v => {
  if (v == null) return 0
  if (typeof v === 'object' && v.value !== undefined) return parseFloat(v.value) || 0
  return Number(v) || 0
}
function weekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}
function monthKey(dateStr) { return dateStr.slice(0, 7) }

const bq = new BigQuery({ keyFilename: 'sa_key.json' })

// Default 30-day window — same as the frontend's default date picker range
const end = new Date()
end.setDate(end.getDate() - 1) // d-1: yesterday as last complete day
const endStr = end.toISOString().slice(0, 10)
const startD = new Date(end)
startD.setDate(startD.getDate() - 29) // 30 days inclusive
const startStr = startD.toISOString().slice(0, 10)
// Widen fetch for momentum (7d lookback) and top movers (7d lookback from end)
const fetchStart = new Date(startD)
fetchStart.setDate(fetchStart.getDate() - 7)
const fetchStartStr = fetchStart.toISOString().slice(0, 10)

console.log(`Fetching sales ${fetchStartStr} → ${endStr}, aggregating for range ${startStr} → ${endStr}`)

const [[salesRows], [itemMasterRows], [invRows], [skuMappingRows]] = await Promise.all([
  bq.query({
    query: `SELECT final_sku, Facility, state, channel, order_date, SUM(total_quantity) AS qty, SUM(total_revenue) AS rev
            FROM \`frido-429506.production.aggregated_uniware_sales_report\`
            WHERE order_date BETWEEN '${fetchStartStr}' AND '${endStr}'
            GROUP BY final_sku, Facility, state, channel, order_date`,
    maximumBytesBilled: '5000000000',
  }),
  bq.query({
    query: `SELECT Product_Code, Category_Name, Sub_category, Type
            FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\``,
    maximumBytesBilled: '1000000000',
  }),
  bq.query({
    query: `WITH d AS (
              SELECT *, ROW_NUMBER() OVER (PARTITION BY ItemSkuCode, Facility ORDER BY Updated DESC, _daton_batch_runtime DESC) AS rn
              FROM \`frido-429506.Frido_BigQuery.Frido_Unicommerce_3_Inventory_Snapshot_Inventory_Snapshot\`
            )
            SELECT ItemSkuCode, Facility,
              SAFE_CAST(Inventory_st AS FLOAT64) AS Inventory,
              SAFE_CAST(InventoryBlocked_st AS FLOAT64) AS InventoryBlocked
            FROM d WHERE rn = 1`,
    maximumBytesBilled: '5000000000',
  }),
  bq.query({
    query: `SELECT DISTINCT TRIM(productid) AS productid, TRIM(masterskucode) AS masterskucode
            FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\`
            WHERE TRIM(masterskucode) NOT IN ('', 'not found')`,
    maximumBytesBilled: '1000000000',
  }),
])

const { facilityToLocation, facilityToDisplayName, facilityToStatus, stateToRegion, stateToNearestWH, locationToRegion, channelToUnified, channelToUnified2, channelToDescription } = buildFacilityMaps()
const skuMap = buildSkuMap(skuMappingRows)
const daysInRange = 30

const itemMaster = new Map()
for (const r of itemMasterRows) {
  if (!r.Product_Code) continue
  if (norm(r.Type) === 'BUNDLE') continue
  if (norm(r.Category_Name) === 'COMBO') continue
  itemMaster.set(normSku(r.Product_Code), {
    category: cleanLabel(r.Category_Name) || 'Uncategorized',
    subCategory: cleanLabel(r.Sub_category) || 'Uncategorized',
  })
}

const invBySku = new Map()
for (const row of invRows) {
  if (isPseudoSku(row.ItemSkuCode)) continue
  if (facilityToStatus.get(row.Facility) !== 'Live') continue
  const { key } = resolveMasterSkuKey(row.ItemSkuCode, skuMap)
  if (!key) continue
  if (!itemMaster.has(key)) continue
  const { totalInventory } = computeRowInventory(row)
  invBySku.set(key, (invBySku.get(key) || 0) + totalInventory)
}

// Determine latest sales date → lastSalesDateConsidered (d-1)
let maxSalesDate = null
for (const row of salesRows) {
  if (isPseudoSku(row.final_sku)) continue
  const d = row.order_date?.value || row.order_date
  if (d && (!maxSalesDate || d > maxSalesDate)) maxSalesDate = d
}
let lastSalesDateConsidered = null
if (maxSalesDate) {
  const d = new Date(maxSalesDate); d.setDate(d.getDate() - 1)
  lastSalesDateConsidered = d.toISOString().slice(0, 10)
}

// No filters — all rows qualify (passesFilters always true when no filter is active)
function passesFilters(r) {
  if (isPseudoSku(r.final_sku)) return false
  const { key } = resolveMasterSkuKey(r.final_sku, skuMap)
  const master = itemMaster.get(key)
  if (!master) return false
  const type = salesTypeFor(r.channel, channelToDescription)
  if (!type) return false
  return true
}

const rangeRows = salesRows.filter(r => {
  const date = r.order_date?.value || r.order_date
  return date >= startStr && passesFilters(r)
})
const lookbackRows = salesRows.filter(passesFilters)

// ── Daily trend ──────────────────────────────────────────────────────────────
const dailyMap = new Map()
for (const r of rangeRows) {
  const date = r.order_date?.value || r.order_date
  if (!date) continue
  if (!dailyMap.has(date)) dailyMap.set(date, { date, qty: 0, rev: 0 })
  const d = dailyMap.get(date)
  d.qty += Number(r.qty || 0)
  d.rev += num(r.rev)
}
const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))

function rollup(keyFn) {
  const m = new Map()
  for (const d of daily) {
    const k = keyFn(d.date)
    if (!m.has(k)) m.set(k, { date: k, qty: 0, rev: 0 })
    const acc = m.get(k)
    acc.qty += d.qty
    acc.rev += d.rev
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
}
const weekly = rollup(weekKey)
const monthly = rollup(monthKey)

// ── Per-SKU daily (momentum) ──────────────────────────────────────────────────
const skuDailyMap = new Map()
for (const r of lookbackRows) {
  const date = r.order_date?.value || r.order_date
  if (!date) continue
  const { key } = resolveMasterSkuKey(r.final_sku, skuMap)
  if (!skuDailyMap.has(key)) skuDailyMap.set(key, new Map())
  const perDate = skuDailyMap.get(key)
  perDate.set(date, (perDate.get(date) || 0) + Number(r.qty || 0))
}
const lookbackDates = [...new Set(lookbackRows.map(r => r.order_date?.value || r.order_date))].filter(Boolean).sort()

// ── Momentum ─────────────────────────────────────────────────────────────────
function momentumFor(N) {
  if (lookbackDates.length < N + 1) return { risers: [], fallers: [], lastDate: null, compareDate: null }
  const lastDate = lookbackDates[lookbackDates.length - 1]
  const compareDate = lookbackDates[lookbackDates.length - 1 - N]
  const rows = []
  for (const [skuKey, perDate] of skuDailyMap) {
    const lastQty = perDate.get(lastDate) || 0
    const compareQty = perDate.get(compareDate) || 0
    if (compareQty === 0 && lastQty === 0) continue
    const pctChange = compareQty > 0 ? ((lastQty - compareQty) / compareQty) * 100 : (lastQty > 0 ? 100 : 0)
    const master = itemMaster.get(skuKey)
    rows.push({ sku: skuKey, category: master?.category || 'Uncategorized', lastQty, compareQty, pctChange })
  }
  const risers = [...rows].filter(r => r.pctChange > 0).sort((a, b) => b.pctChange - a.pctChange).slice(0, 10)
  const fallers = [...rows].filter(r => r.pctChange < 0).sort((a, b) => a.pctChange - b.pctChange).slice(0, 10)
  return { risers, fallers, lastDate, compareDate }
}
const momentum = { requested: momentumFor(7), '2day': momentumFor(2), '7day': momentumFor(7) }

// ── Top Movers ───────────────────────────────────────────────────────────────
function buildDailyMap(keyFn) {
  const m = new Map()
  for (const r of lookbackRows) {
    const date = r.order_date?.value || r.order_date
    if (!date) continue
    const groupKey = keyFn(r)
    if (!groupKey) continue
    if (!m.has(groupKey)) m.set(groupKey, new Map())
    const perDate = m.get(groupKey)
    if (!perDate.has(date)) perDate.set(date, { qty: 0, rev: 0 })
    const d = perDate.get(date)
    d.qty += Number(r.qty || 0)
    d.rev += num(r.rev)
  }
  return m
}
const moversDailyByLevel = {
  sku: buildDailyMap(r => resolveMasterSkuKey(r.final_sku, skuMap).key),
  subCategory: buildDailyMap(r => {
    const { key } = resolveMasterSkuKey(r.final_sku, skuMap)
    const master = itemMaster.get(key)
    if (!master) return null
    return `${master.category}|${master.subCategory}`
  }),
  category: buildDailyMap(r => {
    const { key } = resolveMasterSkuKey(r.final_sku, skuMap)
    return itemMaster.get(key)?.category || null
  }),
}
const moversLabelForLevel = {
  sku: groupKey => {
    const master = itemMaster.get(groupKey)
    return { sku: groupKey, category: master?.category || 'Uncategorized', subCategory: master?.subCategory || null }
  },
  subCategory: groupKey => { const [cat, sub] = groupKey.split('|'); return { subCategory: sub, category: cat } },
  category: groupKey => ({ category: groupKey }),
}

function resolveCompareDates(mode) {
  const windowN = mode === 'day2' ? 1 : 6
  const compareD = new Date(endStr); compareD.setDate(compareD.getDate() - windowN)
  const compareDate = compareD.toISOString().slice(0, 10)
  if (!lookbackDates.includes(endStr) && !lookbackDates.includes(compareDate)) return null
  return { lastDate: endStr, compareDate }
}

function topMoversFor(level, mode, metric) {
  const dates = resolveCompareDates(mode)
  if (!dates) return { risers: [], fallers: [], lastDate: null, compareDate: null }
  const { lastDate, compareDate } = dates
  const dm = moversDailyByLevel[level]
  const labelFor = moversLabelForLevel[level]
  const rows = []
  for (const [groupKey, perDate] of dm) {
    const lastVal = perDate.get(lastDate)?.[metric] || 0
    const compareVal = perDate.get(compareDate)?.[metric] || 0
    if (lastVal === 0 && compareVal === 0) continue
    const pctChange = compareVal > 0 ? ((lastVal - compareVal) / compareVal) * 100 : (lastVal > 0 ? 100 : 0)
    rows.push({ ...labelFor(groupKey), lastVal, compareVal, pctChange })
  }
  const risers = [...rows].filter(r => r.pctChange > 0).sort((a, b) => b.pctChange - a.pctChange).slice(0, 20)
  const fallers = [...rows].filter(r => r.pctChange < 0).sort((a, b) => a.pctChange - b.pctChange).slice(0, 20)
  return { risers, fallers, lastDate, compareDate }
}
const topMovers = {}
for (const level of ['sku', 'subCategory', 'category']) {
  topMovers[level] = {}
  for (const mode of ['day2', 'day7']) {
    topMovers[level][mode] = { qty: topMoversFor(level, mode, 'qty'), rev: topMoversFor(level, mode, 'rev') }
  }
}

// ── Channel x Location allocation matrix ─────────────────────────────────────
const matrixMap = new Map()
const channelSet = new Set()
for (const r of rangeRows) {
  const location = facilityToLocation.get(r.Facility) || 'Unmapped'
  const rawChannel = channelToUnified.get(norm(r.channel)) || r.channel || 'Unknown'
  const channel = norm(rawChannel)
  channelSet.add(channel)
  const key = `${location}|${channel}`
  matrixMap.set(key, (matrixMap.get(key) || 0) + Number(r.qty || 0))
}
const matrixLocations = [...new Set([...matrixMap.keys()].map(k => k.split('|')[0]))].filter(l => l !== 'Unmapped')
const channelMatrix = sortByLocationOrder(matrixLocations.map(location => {
  const row = { location }
  let rowTotal = 0
  for (const channel of channelSet) { const v = matrixMap.get(`${location}|${channel}`) || 0; row[channel] = v; rowTotal += v }
  row._total = rowTotal
  return row
}), r => r.location)
const topChannels = [...channelSet].map(channel => ({
  channel, total: [...matrixMap.entries()].filter(([k]) => k.endsWith(`|${channel}`)).reduce((s, [, v]) => s + v, 0),
})).sort((a, b) => b.total - a.total).slice(0, 8).map(c => c.channel)

// ── Channel sales ─────────────────────────────────────────────────────────────
const channelSalesMap = new Map()
const channelTypeMap = new Map()
const channelTrendMap = new Map()
for (const r of rangeRows) {
  const unified = norm(channelToUnified.get(norm(r.channel)) || r.channel || 'Unknown')
  const type = salesTypeFor(r.channel, channelToDescription)
  const qty = Number(r.qty || 0), rev = num(r.rev)
  if (!channelSalesMap.has(unified)) channelSalesMap.set(unified, { channel: unified, qty: 0, rev: 0 })
  const cs = channelSalesMap.get(unified)
  cs.qty += qty; cs.rev += rev
  if (!channelTypeMap.has(type)) channelTypeMap.set(type, { type, qty: 0, rev: 0 })
  const ct = channelTypeMap.get(type)
  ct.qty += qty; ct.rev += rev
  const date = r.order_date?.value || r.order_date
  const trendKey = `${date}|${unified}`
  if (!channelTrendMap.has(trendKey)) channelTrendMap.set(trendKey, { date, channel: unified, qty: 0, rev: 0 })
  const tr = channelTrendMap.get(trendKey)
  tr.qty += qty; tr.rev += rev
}
const channelSales = [...channelSalesMap.values()].sort((a, b) => b.rev - a.rev)
const channelTypeSales = [...channelTypeMap.values()].sort((a, b) => b.rev - a.rev)
const topChannelNames = channelSales.slice(0, 6).map(c => c.channel)
const channelTrend = [...new Set([...channelTrendMap.values()].map(t => t.date))].sort().map(date => {
  const point = { date }
  for (const ch of topChannelNames) { const v = channelTrendMap.get(`${date}|${ch}`); point[ch] = v ? v.qty : 0 }
  return point
})

// ── channel2 ──────────────────────────────────────────────────────────────────
const channel2Map = new Map()
for (const r of rangeRows) {
  const unified2 = channelToUnified2.get(norm(r.channel)) || 'Purchase Order'
  if (!channel2Map.has(unified2)) channel2Map.set(unified2, { channel: unified2, qty: 0, rev: 0 })
  const c2 = channel2Map.get(unified2)
  c2.qty += Number(r.qty || 0); c2.rev += num(r.rev)
}
const channelSales2 = [...channel2Map.values()].sort((a, b) => b.rev - a.rev)

// ── Region demand vs allocation ───────────────────────────────────────────────
const regionDemand = new Map()
const regionAlloc = new Map()
for (const r of rangeRows) {
  const qty = Number(r.qty || 0)
  const demandRegion = stateToRegion.get(norm(r.state))
  if (demandRegion) regionDemand.set(demandRegion, (regionDemand.get(demandRegion) || 0) + qty)
  const location = facilityToLocation.get(r.Facility)
  const allocRegion = location ? locationToRegion.get(location) : null
  if (allocRegion) regionAlloc.set(allocRegion, (regionAlloc.get(allocRegion) || 0) + qty)
}
const allRegions = new Set([...regionDemand.keys(), ...regionAlloc.keys()])
const regionComparison = [...allRegions].map(region => {
  const demand = regionDemand.get(region) || 0
  const alloc = regionAlloc.get(region) || 0
  return { region, demand: Math.round(demand / daysInRange), allocation: Math.round(alloc / daysInRange), fillRate: demand > 0 ? Math.min(1, alloc / demand) : null }
}).sort((a, b) => (b.demand + b.allocation) - (a.demand + a.allocation))

// ── Exact Fill Rate ────────────────────────────────────────────────────────────
const whDemand = new Map()
const whCorrect = new Map()
let exactCorrectQty = 0, exactTotalQty = 0
for (const r of rangeRows) {
  const nearestWH = stateToNearestWH.get(norm(r.state))
  const location = facilityToLocation.get(r.Facility)
  if (!nearestWH || !location) continue
  const qty = Number(r.qty || 0)
  exactTotalQty += qty
  whDemand.set(nearestWH, (whDemand.get(nearestWH) || 0) + qty)
  if (location === nearestWH) { exactCorrectQty += qty; whCorrect.set(nearestWH, (whCorrect.get(nearestWH) || 0) + qty) }
}
const exactFillRate = exactTotalQty > 0 ? exactCorrectQty / exactTotalQty : null
const fillRateByWarehouse = sortByLocationOrder([...whDemand.entries()].map(([wh, demand]) => {
  const correct = whCorrect.get(wh) || 0
  return { warehouse: wh, demandQty: Math.round(demand), demandQtyPerDay: Math.round(demand / daysInRange), correctQty: Math.round(correct), correctQtyPerDay: Math.round(correct / daysInRange), fillRate: demand > 0 ? correct / demand : null }
}), r => r.warehouse)

// ── Facility allocation ────────────────────────────────────────────────────────
const facilityQty = new Map()
const facilityRev = new Map()
const facilitySkus = new Map()
for (const r of rangeRows) {
  const location = facilityToLocation.get(r.Facility)
  if (!location) continue
  facilityQty.set(location, (facilityQty.get(location) || 0) + Number(r.qty || 0))
  facilityRev.set(location, (facilityRev.get(location) || 0) + num(r.rev))
  const { key } = resolveMasterSkuKey(r.final_sku, skuMap)
  if (!facilitySkus.has(location)) facilitySkus.set(location, new Set())
  facilitySkus.get(location).add(key)
}
const totalAllocQty = [...facilityQty.values()].reduce((s, v) => s + v, 0)
let facilityAllocation = [...facilityQty.entries()].map(([location, qty]) => {
  const region = locationToRegion.get(location)
  const regionTotalDemand = region ? (regionDemand.get(region) || 0) : 0
  const rev = facilityRev.get(location) || 0
  return {
    location, region: region || null, qty: Math.round(qty), qtyPerDay: Math.round(qty / daysInRange),
    rev: Math.round(rev), revPerDay: Math.round(rev / daysInRange), asp: qty > 0 ? Math.round(rev / qty) : null,
    sharePct: totalAllocQty > 0 ? qty / totalAllocQty : null,
    skuCount: facilitySkus.get(location)?.size || 0,
    allocationPct: regionTotalDemand > 0 ? Math.min(1, qty / regionTotalDemand) : null,
  }
})
facilityAllocation = sortByLocationOrder(facilityAllocation, l => l.location)
const facilityAllocationByRevenue = [...facilityAllocation].sort((a, b) => b.rev - a.rev)

// ── Category / Sub-category / SKU sales ───────────────────────────────────────
const catMap = new Map()
const subCatMap = new Map()
const skuSalesMap = new Map()
const skuVariantMap = new Map()
for (const r of rangeRows) {
  const { key, finalSku } = resolveMasterSkuKey(r.final_sku, skuMap)
  const master = itemMaster.get(key)
  if (!master) continue
  const cat = master.category, sub = master.subCategory
  if (!catMap.has(cat)) catMap.set(cat, { category: cat, qty: 0, rev: 0 })
  const c = catMap.get(cat); c.qty += Number(r.qty || 0); c.rev += num(r.rev)
  const subKey = `${cat}|${sub}`
  if (!subCatMap.has(subKey)) subCatMap.set(subKey, { category: cat, subCategory: sub, qty: 0, rev: 0 })
  const sc = subCatMap.get(subKey); sc.qty += Number(r.qty || 0); sc.rev += num(r.rev)
  if (!skuSalesMap.has(key)) skuSalesMap.set(key, { sku: finalSku, skuKey: key, category: cat, subCategory: sub, qty: 0, rev: 0 })
  const s = skuSalesMap.get(key); s.qty += Number(r.qty || 0); s.rev += num(r.rev)
  const rawCode = String(r.final_sku || '').trim()
  if (!skuVariantMap.has(key)) skuVariantMap.set(key, new Map())
  const variants = skuVariantMap.get(key)
  if (!variants.has(rawCode)) variants.set(rawCode, { sku: rawCode, qty: 0, rev: 0 })
  const v = variants.get(rawCode); v.qty += Number(r.qty || 0); v.rev += num(r.rev)
}
const categorySales = [...catMap.values()].sort((a, b) => b.rev - a.rev)
const subCategorySales = [...subCatMap.values()].sort((a, b) => b.rev - a.rev)

// ── Sparklines + Top Movers by Qty/Rev ────────────────────────────────────────
const sparkDates = daily.slice(-14).map(d => d.date)
function sparklineFor(skuKey) {
  const perDate = skuDailyMap.get(skuKey)
  return sparkDates.map(d => perDate?.get(d) || 0)
}
function variantsFor(skuKey) {
  const m = skuVariantMap.get(skuKey)
  if (!m) return []
  return [...m.values()].sort((a, b) => b.qty - a.qty)
}
const skuSalesArr = [...skuSalesMap.values()]
const topMoversByQty = [...skuSalesArr].sort((a, b) => b.qty - a.qty).slice(0, 10)
  .map(s => ({ ...s, sparkline: sparklineFor(s.skuKey), variants: variantsFor(s.skuKey) }))
const topMoversByRevenue = [...skuSalesArr].sort((a, b) => b.rev - a.rev).slice(0, 10)
  .map(s => ({ ...s, sparkline: sparklineFor(s.skuKey), variants: variantsFor(s.skuKey) }))
const productSales = [...skuSalesArr]
  .map(s => ({ sku: s.sku, category: s.category, subCategory: s.subCategory, qty: s.qty, rev: Math.round(s.rev), asp: s.qty > 0 ? Math.round(s.rev / s.qty) : null }))
  .sort((a, b) => b.rev - a.rev)

// ── Product-Wise Sales Matrix ─────────────────────────────────────────────────
const MSEP = '\x1f'
const matrixCells = new Map()
const matrixDatesSet = new Set()
function addCell(catKey, subKey, skuKeyPath, date, qty, rev) {
  const cellKey = `${catKey}${MSEP}${subKey}${MSEP}${skuKeyPath}${MSEP}${date}`
  if (!matrixCells.has(cellKey)) matrixCells.set(cellKey, { qty: 0, rev: 0 })
  const c = matrixCells.get(cellKey); c.qty += qty; c.rev += rev
}
const matrixSkuMeta = new Map()
for (const r of rangeRows) {
  const date = r.order_date?.value || r.order_date
  if (!date) continue
  const { key, finalSku } = resolveMasterSkuKey(r.final_sku, skuMap)
  const master = itemMaster.get(key)
  if (!master) continue
  const cat = master.category, sub = master.subCategory
  const qty = Number(r.qty || 0), rev = num(r.rev)
  matrixDatesSet.add(date)
  if (!matrixSkuMeta.has(key)) matrixSkuMeta.set(key, { sku: finalSku, category: cat, subCategory: sub })
  addCell(cat, '', '', date, qty, rev)
  addCell(cat, sub, '', date, qty, rev)
  addCell(cat, sub, key, date, qty, rev)
}
const matrixCellRows = [...matrixCells.entries()].map(([k, v]) => {
  const [cat, sub, skuKeyPath, date] = k.split(MSEP)
  return { path: `${cat}${MSEP}${sub}${MSEP}${skuKeyPath}`, date, qty: Math.round(v.qty), rev: Math.round(v.rev) }
})
const matrixSkuList = [...matrixSkuMeta.entries()].map(([key, meta]) => ({ skuKey: key, ...meta }))
const matrixDates = [...matrixDatesSet].sort()

// ── Dead Stock ────────────────────────────────────────────────────────────────
const deadStock = [...invBySku.entries()]
  .filter(([, invt]) => invt > 0)
  .map(([key, invt]) => ({ skuKey: key, sku: skuSalesMap.get(key)?.sku || key, totalInvt: Math.round(invt), qtySold: skuSalesMap.get(key)?.qty || 0 }))
  .filter(s => s.qtySold === 0)
  .sort((a, b) => b.totalInvt - a.totalInvt)
  .slice(0, 10)

// ── KPIs ──────────────────────────────────────────────────────────────────────
const totalUnits = daily.reduce((s, d) => s + d.qty, 0)
const totalRevenue = daily.reduce((s, d) => s + d.rev, 0)
const avgSellingPrice = totalUnits > 0 ? totalRevenue / totalUnits : 0
const avgDailyRevenue = totalRevenue / daysInRange
const avgDailyUnits = totalUnits / daysInRange
const totalDemand = [...regionDemand.values()].reduce((s, v) => s + v, 0)
const totalAlloc = [...regionAlloc.values()].reduce((s, v) => s + v, 0)
const fillRate = totalDemand > 0 ? Math.min(1, totalAlloc / totalDemand) : null
const firstDay = daily[0]?.qty || 0
const lastDay = daily[daily.length - 1]?.qty || 0
const momentumPct = firstDay > 0 ? ((lastDay - firstDay) / firstDay) * 100 : null

// ── Filter options (static reference data, not affected by filters) ─────────
const liveFacilities = [...facilityToStatus.entries()].filter(([, status]) => status === 'Live').map(([f]) => f)
const filterOptions = {
  categories: [...new Set([...itemMaster.values()].map(m => m.category))].sort(),
  subCategories: [...new Set([...itemMaster.values()].map(m => m.subCategory))].sort(),
  channels: [...new Set([...channelToUnified.values()].map(c => norm(c)))].sort(),
  unifiedChannels2: [...new Set([...channelToUnified2.values()].filter(Boolean).concat('Purchase Order'))].sort(),
  salesTypes: ['B2C Order', 'B2B Order', 'Purchase Order'],
  regions: [...new Set([...stateToRegion.values()])].sort(),
  facilities: liveFacilities.map(f => ({ facility: f, displayName: facilityToDisplayName.get(f) || f })).sort((a, b) => a.facility.localeCompare(b.facility)),
  skus: [...skuSalesMap.values()].map(s => s.sku).sort(),
}

const payload = {
  asOf: new Date().toISOString(),
  dateRange: { start: startStr, end: endStr, days: daysInRange },
  lastSalesDate: maxSalesDate,
  lastSalesDateConsidered,
  momentumWindow: 7,
  topN: 10,
  filterOptions,
  summary: {
    totalUnits: Math.round(totalUnits),
    totalRevenue: Math.round(totalRevenue),
    avgDailyRevenue: Math.round(avgDailyRevenue),
    avgDailyUnits: Math.round(avgDailyUnits),
    avgSellingPrice: Math.round(avgSellingPrice),
    fillRate,
    exactFillRate,
    momentumPct,
  },
  previousPeriod: null,
  daily, weekly, monthly,
  momentum,
  topMovers,
  channelMatrix, topChannels,
  channelSales, channelSales2, channelTypeSales,
  channelTrend, topChannelNames,
  regionComparison,
  facilityAllocation, facilityAllocationByRevenue,
  fillRateByWarehouse,
  categorySales, subCategorySales, productSales,
  matrixCellRows, matrixSkuList, matrixDates,
  topMoversByQty, topMoversByRevenue,
  deadStock,
}

const json = JSON.stringify(payload)
writeFileSync('public/sales-alloc-data.json', json)
console.log(`Written public/sales-alloc-data.json — ${(json.length / 1024).toFixed(0)}KB`)
