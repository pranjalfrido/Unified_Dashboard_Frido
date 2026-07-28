// Runs in GitHub Actions — fetches GRN/item master/inv/sales from BQ,
// replicates all JS aggregation from api/inward.js (without any filters),
// writes public/inward-data.json for CDN delivery.

import { writeFileSync } from 'fs'
import { BigQuery } from '@google-cloud/bigquery'
import {
  buildFacilityMaps, norm, normSku, cleanLabel,
  parsePackQty, isRawSkuText, isPseudoSku, computeRowInventory,
  buildSkuMap, resolveMasterSkuKey, sortByLocationOrder,
  isB2CChannel, isTotalAvgSaleChannel, stockStatus,
} from '../api/_inventory_shared.js'

const AVG_SALE_WINDOW_DAYS = 7

function weekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}
function monthKey(dateStr) { return dateStr.slice(0, 7) }

const bq = new BigQuery({ keyFilename: 'sa_key.json' })

// Default: last 30 days of GRN data
const today = new Date()
const todayStr = today.toISOString().slice(0, 10)
const endD = new Date(today); endD.setDate(endD.getDate() - 1)
const endStr = endD.toISOString().slice(0, 10)
const startD = new Date(endD); startD.setDate(startD.getDate() - 29)
const startStr = startD.toISOString().slice(0, 10)
// Widen sales fetch for avg sale window
const avgSaleFetchStart = new Date(today); avgSaleFetchStart.setDate(avgSaleFetchStart.getDate() - (AVG_SALE_WINDOW_DAYS + 5))
const salesFetchStartStr = avgSaleFetchStart < new Date(startStr) ? avgSaleFetchStart.toISOString().slice(0, 10) : startStr

console.log(`Fetching GRN ${startStr} → ${endStr}, sales ${salesFetchStartStr} → ${todayStr}`)

const [[grnRows], [itemMasterRows], [skuMappingRows], [invRows], [salesRows]] = await Promise.all([
  bq.query({
    query: `SELECT
              \`GRN Code\` AS grnCode, \`GRN Date\` AS grnDate, \`Item SkuCode\` AS itemSkuCode,
              Facility, Category AS rawCategory, \`Vendor Name\` AS vendorName, \`Vendor Code\` AS vendorCode,
              \`PO Code\` AS poCode, \`PO Date\` AS poDate,
              \`Quantity Received\` AS qtyReceived, \`Quantity Rejected\` AS qtyRejected,
              \`Rejection Reason\` AS rejectionReason, \`Grn item Status\` AS grnStatus,
              \`GRN Received Timestamp\` AS grnReceivedTs, \`QC Completed On\` AS qcCompletedOn
            FROM \`frido-429506.production.Unicommerce_GRN_Report\`
            WHERE DATE(\`GRN Date\`) BETWEEN '${startStr}' AND '${endStr}'`,
    maximumBytesBilled: '5000000000',
  }),
  bq.query({
    query: `SELECT Product_Code, Category_Name, Sub_category, Type
            FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\``,
    maximumBytesBilled: '1000000000',
  }),
  bq.query({
    query: `SELECT DISTINCT TRIM(productid) AS productid, TRIM(masterskucode) AS masterskucode
            FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\`
            WHERE TRIM(masterskucode) NOT IN ('', 'not found')`,
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
    query: `SELECT final_sku, state, channel, order_date, SUM(total_quantity) AS qty
            FROM \`frido-429506.production.aggregated_uniware_sales_report\`
            WHERE order_date BETWEEN '${salesFetchStartStr}' AND '${todayStr}'
            GROUP BY final_sku, state, channel, order_date`,
    maximumBytesBilled: '5000000000',
  }),
])

const { facilityToLocation, facilityToStatus, channelToDescription } = buildFacilityMaps()
const skuMap = buildSkuMap(skuMappingRows)
const cleanSalesRows = salesRows.filter(row => !isPseudoSku(row.final_sku))

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
  const { totalInventory } = computeRowInventory(row)
  invBySku.set(key, (invBySku.get(key) || 0) + totalInventory)
}

// Avg sale anchoring: d-1 of max sales date, same as Inventory Health
let maxSalesDate = null
for (const row of cleanSalesRows) {
  const d = row.order_date?.value || row.order_date
  if (d && (!maxSalesDate || d > maxSalesDate)) maxSalesDate = d
}
let salesWindowEnd = todayStr, salesWindowStart = todayStr
if (maxSalesDate) {
  const anchorEnd = new Date(maxSalesDate); anchorEnd.setDate(anchorEnd.getDate() - 1)
  const anchorStart = new Date(anchorEnd); anchorStart.setDate(anchorStart.getDate() - (AVG_SALE_WINDOW_DAYS - 1))
  salesWindowEnd = anchorEnd.toISOString().slice(0, 10)
  salesWindowStart = anchorStart.toISOString().slice(0, 10)
}
const avgSaleQtyBySku = new Map()
for (const row of cleanSalesRows) {
  const d = row.order_date?.value || row.order_date
  if (!d || d < salesWindowStart || d > salesWindowEnd) continue
  if (!isB2CChannel(row.channel, channelToDescription)) continue
  const { key } = resolveMasterSkuKey(row.final_sku, skuMap)
  if (!key) continue
  avgSaleQtyBySku.set(key, (avgSaleQtyBySku.get(key) || 0) + Number(row.qty || 0))
}
const avgSaleBySku = new Map()
for (const [key, qty] of avgSaleQtyBySku) avgSaleBySku.set(key, Math.ceil(qty / AVG_SALE_WINDOW_DAYS))

// Total sold qty over the full GRN period
let totalSoldQty = 0
for (const row of cleanSalesRows) {
  const d = row.order_date?.value || row.order_date
  if (!d || d < startStr || d > endStr) continue
  if (!isTotalAvgSaleChannel(row.channel, channelToDescription)) continue
  const { key } = resolveMasterSkuKey(row.final_sku, skuMap)
  if (!key || !itemMaster.has(key)) continue
  totalSoldQty += Number(row.qty || 0)
}

// Build resolved GRN rows (all facilities, no filter)
const rows = []
for (const r of grnRows) {
  if (isPseudoSku(r.itemSkuCode)) continue
  if (facilityToStatus.get(r.Facility) !== 'Live') continue
  const { key, finalSku } = resolveMasterSkuKey(r.itemSkuCode, skuMap)
  if (!key) continue
  const master = itemMaster.get(key)
  const packQty = parsePackQty(r.itemSkuCode)
  const isRaw = isRawSkuText(r.itemSkuCode)
  const qtyReceived = Number(r.qtyReceived || 0) * (isRaw ? packQty : 1)
  const qtyRejected = Number(r.qtyRejected || 0) * (isRaw ? packQty : 1)
  const location = facilityToLocation.get(r.Facility) || 'Unmapped'
  const grnDate = r.grnDate?.value || r.grnDate
  const date = grnDate ? String(grnDate).slice(0, 10) : null
  const receivedTs = r.grnReceivedTs?.value || r.grnReceivedTs
  const qcTs = r.qcCompletedOn?.value || r.qcCompletedOn
  const leadTimeHours = receivedTs && qcTs ? (new Date(qcTs) - new Date(receivedTs)) / 3600000 : null
  rows.push({
    grnCode: r.grnCode, date, sku: finalSku, skuKey: key,
    category: master?.category || 'Unmapped',
    subCategory: master?.subCategory || 'Unmapped',
    matched: !!master,
    facility: r.Facility, location,
    vendorName: cleanLabel(r.vendorName) || 'Unknown', vendorCode: r.vendorCode,
    poCode: r.poCode, qtyReceived, qtyRejected,
    rejectionReason: r.rejectionReason || null,
    grnStatus: r.grnStatus, leadTimeHours,
  })
}

// No category/facility filters — include all finished goods except Unmapped by default
// (same as api/inward.js when includeUnmapped=false)
const finishedGoods = rows.filter(r => r.category !== 'Unmapped')

// Per-SKU sold qty
const soldQtyBySku = new Map()
for (const row of cleanSalesRows) {
  const d = row.order_date?.value || row.order_date
  if (!d || d < startStr || d > endStr) continue
  if (!isTotalAvgSaleChannel(row.channel, channelToDescription)) continue
  const { key } = resolveMasterSkuKey(row.final_sku, skuMap)
  if (!key) continue
  soldQtyBySku.set(key, (soldQtyBySku.get(key) || 0) + Number(row.qty || 0))
}

// SKU table
const skuMap2 = new Map()
for (const r of finishedGoods) {
  if (!skuMap2.has(r.skuKey)) skuMap2.set(r.skuKey, { sku: r.sku, category: r.category, subCategory: r.subCategory, qtyReceived: 0, qtyRejected: 0 })
  const s = skuMap2.get(r.skuKey); s.qtyReceived += r.qtyReceived; s.qtyRejected += r.qtyRejected
}
const skuTable = [...skuMap2.entries()].map(([key, s]) => {
  const totalInvt = Math.round(invBySku.get(key) || 0)
  const avgSale = avgSaleBySku.get(key) || 0
  const doi = avgSale > 0 ? Math.floor(totalInvt / avgSale) : (totalInvt > 0 ? null : 0)
  const status = doi == null ? stockStatus(0, avgSale, totalInvt, {}) : stockStatus(doi, avgSale, totalInvt, {})
  return {
    sku: s.sku, category: s.category, subCategory: s.subCategory,
    qtyReceived: Math.round(s.qtyReceived), qtyRejected: Math.round(s.qtyRejected),
    soldQty: Math.round(soldQtyBySku.get(key) || 0),
    totalInvt, avgSale, doi, stockStatus: status,
  }
}).sort((a, b) => b.qtyReceived - a.qtyReceived)

// KPIs
const totalReceived = finishedGoods.reduce((s, r) => s + r.qtyReceived, 0)
const totalRejected = finishedGoods.reduce((s, r) => s + r.qtyRejected, 0)
const rejectionPct = (totalReceived + totalRejected) > 0 ? (totalRejected / (totalReceived + totalRejected)) * 100 : 0
const distinctGrns = new Set(finishedGoods.map(r => r.grnCode)).size
const distinctPOs = new Set(finishedGoods.map(r => r.poCode).filter(Boolean)).size
const leadTimes = finishedGoods.map(r => r.leadTimeHours).filter(v => v != null && v >= 0)
const avgLeadTimeHours = leadTimes.length > 0 ? leadTimes.reduce((s, v) => s + v, 0) / leadTimes.length : null
const distinctVendors = new Set(finishedGoods.map(r => r.vendorName)).size
const distinctSkus = new Set(finishedGoods.map(r => r.skuKey)).size
const inwardCoverageRatio = totalSoldQty > 0 ? totalReceived / totalSoldQty : null

// Daily/weekly/monthly trend
const dailyMap = new Map()
for (const r of finishedGoods) {
  if (!r.date) continue
  if (!dailyMap.has(r.date)) dailyMap.set(r.date, { date: r.date, qtyReceived: 0, qtyRejected: 0 })
  const d = dailyMap.get(r.date); d.qtyReceived += r.qtyReceived; d.qtyRejected += r.qtyRejected
}
const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))
function rollup(keyFn) {
  const m = new Map()
  for (const d of daily) {
    const k = keyFn(d.date)
    if (!m.has(k)) m.set(k, { date: k, qtyReceived: 0, qtyRejected: 0 })
    const acc = m.get(k); acc.qtyReceived += d.qtyReceived; acc.qtyRejected += d.qtyRejected
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
}
const weekly = rollup(weekKey)
const monthly = rollup(monthKey)

// Category / Sub-category breakdown
const catMap = new Map()
const subCatBreakMap = new Map()
for (const r of finishedGoods) {
  if (!catMap.has(r.category)) catMap.set(r.category, { category: r.category, qtyReceived: 0, qtyRejected: 0 })
  const c = catMap.get(r.category); c.qtyReceived += r.qtyReceived; c.qtyRejected += r.qtyRejected
  const subKey = `${r.category}|${r.subCategory}`
  if (!subCatBreakMap.has(subKey)) subCatBreakMap.set(subKey, { category: r.category, subCategory: r.subCategory, qtyReceived: 0, qtyRejected: 0 })
  const sc = subCatBreakMap.get(subKey); sc.qtyReceived += r.qtyReceived; sc.qtyRejected += r.qtyRejected
}
const categoryBreakdown = [...catMap.values()].sort((a, b) => b.qtyReceived - a.qtyReceived)
const subCategoryBreakdown = [...subCatBreakMap.values()].sort((a, b) => b.qtyReceived - a.qtyReceived)

// Vendor performance
const vendorMap = new Map()
for (const r of finishedGoods) {
  if (!vendorMap.has(r.vendorName)) vendorMap.set(r.vendorName, { vendor: r.vendorName, qtyReceived: 0, qtyRejected: 0, grns: new Set() })
  const v = vendorMap.get(r.vendorName); v.qtyReceived += r.qtyReceived; v.qtyRejected += r.qtyRejected; v.grns.add(r.grnCode)
}
const vendorPerformance = [...vendorMap.values()].map(v => ({
  vendor: v.vendor, qtyReceived: v.qtyReceived, qtyRejected: v.qtyRejected,
  rejectionPct: (v.qtyReceived + v.qtyRejected) > 0 ? (v.qtyRejected / (v.qtyReceived + v.qtyRejected)) * 100 : 0,
  grnCount: v.grns.size,
})).sort((a, b) => b.qtyReceived - a.qtyReceived)

// Facility breakdown
const facilityMap = new Map()
for (const r of finishedGoods) {
  if (!facilityMap.has(r.location)) facilityMap.set(r.location, { location: r.location, qtyReceived: 0, qtyRejected: 0 })
  const f = facilityMap.get(r.location); f.qtyReceived += r.qtyReceived; f.qtyRejected += r.qtyRejected
}
const facilityBreakdown = sortByLocationOrder([...facilityMap.values()].filter(f => f.location !== 'Unmapped'), f => f.location)

// Rejection reasons
const reasonMap = new Map()
for (const r of finishedGoods) {
  if (!r.rejectionReason || r.qtyRejected <= 0) continue
  reasonMap.set(r.rejectionReason, (reasonMap.get(r.rejectionReason) || 0) + r.qtyRejected)
}
const rejectionReasons = [...reasonMap.entries()].map(([reason, qty]) => ({ reason, qty })).sort((a, b) => b.qty - a.qty)

// Filter options — from full rows (including Unmapped) so the UI can surface it
const liveFacilities = [...facilityToStatus.entries()].filter(([, status]) => status === 'Live').map(([f]) => f)
const filterOptions = {
  categories: [...new Set(rows.map(r => r.category))].sort((a, b) => (a === 'Unmapped') - (b === 'Unmapped') || a.localeCompare(b)),
  subCategories: [...new Set(finishedGoods.map(r => r.subCategory))].sort(),
  facilities: liveFacilities.filter(f => finishedGoods.some(r => r.facility === f)).sort(),
  vendors: [...new Set(finishedGoods.map(r => r.vendorName))].sort(),
  skus: [...new Set(finishedGoods.map(r => r.sku))].sort(),
}

// Enriched raw rows for client-side filtering in the browser
const rawRows = finishedGoods.map(r => ({
  sku: r.sku, skuKey: r.skuKey,
  category: r.category, subCategory: r.subCategory,
  facility: r.facility, location: r.location,
  vendor: r.vendorName,
  date: r.date,
  qtyReceived: Math.round(r.qtyReceived),
  qtyRejected: Math.round(r.qtyRejected),
  rejectionReason: r.rejectionReason || null,
  leadTimeHours: r.leadTimeHours != null ? Math.round(r.leadTimeHours * 10) / 10 : null,
  grnCode: r.grnCode,
})).filter(r => r.date)

const payload = {
  asOf: new Date().toISOString(),
  dateRange: { start: startStr, end: endStr, days: 30 },
  avgSaleWindow: { start: salesWindowStart, end: salesWindowEnd },
  filterOptions,
  summary: {
    totalReceived: Math.round(totalReceived),
    totalSoldQty: Math.round(totalSoldQty),
    inwardCoverageRatio,
    totalRejected: Math.round(totalRejected),
    rejectionPct,
    distinctGrns,
    distinctPOs,
    distinctVendors,
    distinctSkus,
    avgLeadTimeHours,
  },
  daily, weekly, monthly,
  categoryBreakdown, subCategoryBreakdown,
  vendorPerformance,
  facilityBreakdown,
  rejectionReasons,
  skuTable,
  rawRows,
}

const json = JSON.stringify(payload)
writeFileSync('public/inward-data.json', json)
console.log(`Written public/inward-data.json — ${(json.length / 1024).toFixed(0)}KB`)
