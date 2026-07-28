// Runs in GitHub Actions — fetches all data from Supabase, computes the full
// inventory payload, and writes it to public/inv-data.json so Vercel serves
// it from CDN (~100ms) instead of computing it on every user request.

import pkg from 'pg'
import { writeFileSync } from 'fs'
import {
  buildFacilityMaps, norm, normSku, cleanLabel, computeRowInventory,
  stockStatus, requiredStock, rtdLevel, parseLaunchDate, isNewLaunch, isPseudoSku,
  REORDER_POINT_DOI, isB2CChannel, isTotalAvgSaleChannel, buildSkuMap,
  resolveMasterSkuKey, sortByLocationOrder,
} from '../api/_inventory_shared.js'

const { Pool } = pkg
const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
})

const DEAD_STOCK_WINDOW_DAYS = 90
const STOCK_STATUS_VALUES = ['Critical', 'Low', 'Sufficient', 'Excess', 'Out of Stock', 'Dead / No Sale', 'No Demand']

// Default trailing 7 days (matches what the frontend requests by default)
const endDate = new Date()
endDate.setHours(0, 0, 0, 0)
const startDate = new Date(endDate)
startDate.setDate(startDate.getDate() - 6)
const start = startDate.toISOString().slice(0, 10)
const end = endDate.toISOString().slice(0, 10)
const daysInRange = 7

console.log(`Computing inventory for ${start} → ${end}`)

const db = await pool.connect()

console.log('Fetching all tables from Supabase in parallel...')
const t0 = Date.now()
const [c1,c2,c3,c4,c5,c6] = await Promise.all([1,2,3,4,5,6].map(() => pool.connect()))
const [r1,r2,r3,r4,r5,r6] = await Promise.all([
  c1.query(`SELECT item_sku_code AS "ItemSkuCode", facility AS "Facility", updated AS "Updated", inventory AS "Inventory", inventory_blocked AS "InventoryBlocked" FROM inv_snapshot WHERE inventory > 0 OR inventory_blocked > 0`),
  c2.query(`SELECT final_sku, facility AS "Facility", state, channel, order_date, qty FROM sales_window`),
  c3.query(`SELECT final_sku, last_sale_date, qty_90d FROM sales_90d`),
  c4.query(`SELECT product_code AS "Product_Code", category_name AS "Category_Name", sub_category AS "Sub_category", lead_time AS "Lead_Time", product_source AS "Product_Source", sku_first_sales_date AS "SKU_First_Sales_Date", type AS "Type" FROM item_master`),
  c5.query(`SELECT productid, masterskucode FROM sku_mapping`),
  c6.query(`SELECT sku, available FROM shopify_inv`),
])
;[c1,c2,c3,c4,c5,c6].forEach(c => c.release())
console.log(`Fetched all data in ${Date.now()-t0}ms`)

const invRows = r1.rows, salesRows = r2.rows, lastSaleRows = r3.rows
const itemMasterRows = r4.rows, skuMappingRows = r5.rows, shopifyInvRows = r6.rows

const { facilityToLocation, facilityToType, facilityToStatus, facilityToDisplayName, stateToNearestWH, channelToDescription } = buildFacilityMaps()
const skuMap = buildSkuMap(skuMappingRows)

const liveOnWebsite = new Set()
for (const r of shopifyInvRows) { if (r.sku) liveOnWebsite.add(normSku(r.sku)) }

const itemMaster = new Map()
for (const r of itemMasterRows) {
  if (!r.Product_Code) continue
  if (norm(r.Type) === 'BUNDLE') continue
  if (norm(r.Category_Name) === 'COMBO') continue
  itemMaster.set(normSku(r.Product_Code), {
    category: cleanLabel(r.Category_Name) || 'Uncategorized',
    subCategory: cleanLabel(r.Sub_category) || 'Uncategorized',
    leadTime: parseFloat(r.Lead_Time) || 0,
    productSource: r.Product_Source || null,
    launchDate: parseLaunchDate(r.SKU_First_Sales_Date),
  })
}

let lastSnapshotUpdated = null
for (const row of invRows) {
  const upd = row.Updated?.value || row.Updated
  const ups = upd instanceof Date ? upd.toISOString() : upd
  if (ups && (!lastSnapshotUpdated || ups > lastSnapshotUpdated)) lastSnapshotUpdated = ups
}

const lastSaleBySkuKey = new Map()
for (const r of lastSaleRows) {
  if (isPseudoSku(r.final_sku)) continue
  const { key } = resolveMasterSkuKey(r.final_sku, skuMap)
  if (!key) continue
  const _ld = r.last_sale_date?.value || r.last_sale_date
  const rowDate = _ld instanceof Date ? _ld.toISOString().slice(0,10) : (_ld ? String(_ld).slice(0,10) : null)
  const rowQty = Number(r.qty_90d || 0)
  const existing = lastSaleBySkuKey.get(key)
  if (!existing) { lastSaleBySkuKey.set(key, { lastSaleDate: rowDate, qty90d: rowQty }) }
  else { existing.qty90d += rowQty; if (rowDate && (!existing.lastSaleDate || rowDate > existing.lastSaleDate)) existing.lastSaleDate = rowDate }
}

const baseLiveInvRows = invRows.filter(row => {
  if (isPseudoSku(row.ItemSkuCode)) return false
  if (facilityToStatus.get(row.Facility) !== 'Live') return false
  return true
})

const toDateStr = d => { if (!d) return null; if (d instanceof Date) return d.toISOString().slice(0,10); return String(d).slice(0,10) }

const cleanSalesRowsUnanchored = salesRows.filter(row => !isPseudoSku(row.final_sku))
let maxSalesDate = null
for (const row of cleanSalesRowsUnanchored) {
  const ds = toDateStr(row.order_date?.value || row.order_date)
  if (ds && (!maxSalesDate || ds > maxSalesDate)) maxSalesDate = ds
}
const cleanSalesRows = cleanSalesRowsUnanchored.filter(row => {
  const ds = toDateStr(row.order_date?.value || row.order_date)
  return ds >= start && ds <= end
})

console.log(`Sales rows in range: ${cleanSalesRows.length}/${salesRows.length}`)

// Core aggregation
const invBySkuLoc = new Map()
for (const row of baseLiveInvRows) {
  const { key, finalSku } = resolveMasterSkuKey(row.ItemSkuCode, skuMap)
  if (!key) continue
  const loc = facilityToLocation.get(row.Facility) || 'Unmapped'
  const { totalInventory, rawInvt, rawBlockedInvt, rtdInvt } = computeRowInventory(row)
  const mapKey = `${key}|${loc}`
  if (!invBySkuLoc.has(mapKey)) invBySkuLoc.set(mapKey, { sku: finalSku, skuKey: key, location: loc, totalInvt: 0, rawInvt: 0, rawBlockedInvt: 0, rtdInvt: 0 })
  const acc = invBySkuLoc.get(mapKey)
  acc.totalInvt += totalInventory; acc.rawInvt += rawInvt; acc.rawBlockedInvt += rawBlockedInvt; acc.rtdInvt += rtdInvt
}

const avgSaleBySkuLoc = new Map()
const totalAvgSaleBySkuLoc = new Map()
const allocBySkuLoc = new Map()
for (const row of cleanSalesRows) {
  const { key } = resolveMasterSkuKey(row.final_sku, skuMap)
  if (!key) continue
  const qty = Number(row.qty || 0)
  const isB2C = isB2CChannel(row.channel, channelToDescription)
  const countsTowardTotal = isTotalAvgSaleChannel(row.channel, channelToDescription)
  const nearestWH = stateToNearestWH.get(norm(row.state))
  if (nearestWH) {
    const mapKey = `${key}|${nearestWH}`
    if (countsTowardTotal) totalAvgSaleBySkuLoc.set(mapKey, (totalAvgSaleBySkuLoc.get(mapKey)||0) + qty)
    if (isB2C) avgSaleBySkuLoc.set(mapKey, (avgSaleBySkuLoc.get(mapKey)||0) + qty)
  }
  const facilityLocation = facilityToLocation.get(row.Facility)
  if (countsTowardTotal && facilityLocation) {
    const mapKey = `${key}|${facilityLocation}`
    allocBySkuLoc.set(mapKey, (allocBySkuLoc.get(mapKey)||0) + qty)
  }
}

const endDateObj = new Date(end)
const allKeys = new Set([...invBySkuLoc.keys(), ...avgSaleBySkuLoc.keys(), ...totalAvgSaleBySkuLoc.keys(), ...allocBySkuLoc.keys()])
const skuLocRows = []
for (const mapKey of allKeys) {
  const [skuKey, loc] = mapKey.split('|')
  const invEntry = invBySkuLoc.get(mapKey)
  const totalInvt = invEntry?.totalInvt || 0
  const rawInvt = invEntry?.rawInvt || 0
  const rawBlockedInvt = invEntry?.rawBlockedInvt || 0
  const rtdInvt = invEntry?.rtdInvt || 0
  const sku = invEntry?.sku || skuKey
  const rawQty = avgSaleBySkuLoc.get(mapKey) || 0
  const avgSale = Math.ceil(rawQty / daysInRange)
  const rawTotalQty = totalAvgSaleBySkuLoc.get(mapKey) || 0
  const totalAvgSale = Math.ceil(rawTotalQty / daysInRange)
  const orderAllocation = (allocBySkuLoc.get(mapKey) || 0) / daysInRange
  const denominator = Math.ceil(Math.max(avgSale, orderAllocation))
  const doi = totalInvt > 0 && denominator === 0 ? null : (denominator > 0 ? Math.floor(totalInvt / denominator) : 0)
  const master = itemMaster.get(skuKey)
  const last90 = lastSaleBySkuKey.get(skuKey)
  const newLaunch = isNewLaunch(master?.launchDate, endDateObj)
  const isDead = totalInvt > 0 && (last90?.qty90d || 0) === 0 && !newLaunch
  skuLocRows.push({
    sku, skuKey, location: loc,
    category: master?.category || 'Uncategorized',
    subCategory: master?.subCategory || 'Uncategorized',
    totalInvt, rawInvt, rawBlockedInvt, rtdInvt,
    avgSale, rawAvgSaleQty: rawQty, totalAvgSale, rawTotalAvgSaleQty: rawTotalQty,
    orderAllocation, allocationPct: avgSale > 0 ? (orderAllocation/avgSale)*100 : null,
    doi, thirtyDayReq: Math.round(avgSale*30), inventoryShort: Math.round(avgSale*30 - totalInvt),
    rtdLevel: rtdLevel(rtdInvt, avgSale),
    stockStatus: doi == null ? stockStatus(0, avgSale, totalInvt, {isDead}) : stockStatus(doi, avgSale, totalInvt, {isDead}),
    requiredStock: Math.round(requiredStock(avgSale, master?.leadTime||0, master?.productSource||null, totalInvt)),
    leadTime: master?.leadTime || 0, productSource: master?.productSource || null,
    newLaunch, isDead, lastSaleDate: last90?.lastSaleDate || null,
  })
}

// Roll up to SKU level
const rolledSkuMap = new Map()
for (const r of skuLocRows) {
  if (!rolledSkuMap.has(r.skuKey)) {
    rolledSkuMap.set(r.skuKey, {
      sku: r.sku, skuKey: r.skuKey, category: r.category, subCategory: r.subCategory,
      totalInvt: 0, rawInvt: 0, rawBlockedInvt: 0, rtdInvt: 0, rawAvgSaleQty: 0, rawTotalAvgSaleQty: 0, orderAllocation: 0,
      leadTime: r.leadTime, productSource: r.productSource, newLaunch: r.newLaunch, lastSaleDate: r.lastSaleDate, locations: [],
    })
  }
  const acc = rolledSkuMap.get(r.skuKey)
  acc.totalInvt += r.totalInvt; acc.rawInvt += r.rawInvt; acc.rawBlockedInvt += r.rawBlockedInvt; acc.rtdInvt += r.rtdInvt
  acc.rawAvgSaleQty += r.rawAvgSaleQty; acc.rawTotalAvgSaleQty += r.rawTotalAvgSaleQty; acc.orderAllocation += r.orderAllocation
  acc.locations.push({ location: r.location, totalInvt: r.totalInvt, rawInvt: r.rawInvt, rawBlockedInvt: r.rawBlockedInvt, rtdInvt: r.rtdInvt, avgSale: r.avgSale, doi: r.doi, stockStatus: r.stockStatus })
}

let skus = [...rolledSkuMap.values()].map(s => {
  const avgSale = Math.ceil(s.rawAvgSaleQty / daysInRange)
  const totalAvgSale = Math.ceil(s.rawTotalAvgSaleQty / daysInRange)
  const denominator = Math.ceil(Math.max(avgSale, s.orderAllocation))
  const doi = s.totalInvt > 0 && denominator === 0 ? null : (denominator > 0 ? Math.floor(s.totalInvt / denominator) : 0)
  const isDead = s.totalInvt > 0 && !s.locations.some(l => l.stockStatus !== 'Dead / No Sale' && l.stockStatus !== 'Out of Stock') && s.locations.some(l => l.stockStatus === 'Dead / No Sale')
  const status = doi == null ? stockStatus(0, avgSale, s.totalInvt, {isDead}) : stockStatus(doi, avgSale, s.totalInvt, {isDead})
  const daysSinceLastSale = s.lastSaleDate ? Math.round((endDateObj - new Date(s.lastSaleDate)) / 86400000) : null
  return {
    ...s, avgSale, totalAvgSale, doi, allocationPct: avgSale > 0 ? (s.orderAllocation/avgSale)*100 : null,
    stockStatus: status, isDead, daysSinceLastSale,
    thirtyDayReq: Math.round(avgSale*30), inventoryShort: Math.round(avgSale*30 - s.totalInvt),
    rtdLevel: rtdLevel(s.rtdInvt, avgSale),
    requiredStock: Math.round(requiredStock(avgSale, s.leadTime, s.productSource, s.totalInvt)),
    locations: sortByLocationOrder(s.locations, l => l.location),
    websiteStatus: liveOnWebsite.has(normSku(s.sku)) ? 'Live' : 'Stock Out',
  }
}).sort((a, b) => b.totalInvt - a.totalInvt)
  .filter(s => s.category !== 'Uncategorized')

// Summary KPIs
const totalInvt = skus.reduce((s,r) => s+r.totalInvt, 0)
const totalRaw = skus.reduce((s,r) => s+r.rawInvt, 0)
const totalRawBlocked = skus.reduce((s,r) => s+r.rawBlockedInvt, 0)
const totalRtd = skus.reduce((s,r) => s+r.rtdInvt, 0)
const totalAvgSaleB2C = skus.reduce((s,r) => s+r.avgSale, 0)
const totalAvgSaleAll = skus.reduce((s,r) => s+r.totalAvgSale, 0)
const compDenom = Math.ceil(Math.max(totalAvgSaleB2C, skus.reduce((s,r) => s+r.orderAllocation, 0)))
const compDOI = compDenom > 0 ? Math.floor(totalInvt/compDenom) : 0
const statusCounts = {}
for (const s of skus) statusCounts[s.stockStatus] = (statusCounts[s.stockStatus]||0)+1
let dominantStatus = null, dominantCount = -1
for (const [st,cnt] of Object.entries(statusCounts)) { if (cnt > dominantCount) { dominantStatus = st; dominantCount = cnt } }

// Per-location rollup
const locationMap = new Map()
for (const r of skuLocRows) {
  if (!locationMap.has(r.location)) locationMap.set(r.location, { location: r.location, totalInvt:0, rawInvt:0, rawBlockedInvt:0, rtdInvt:0, rawAvgSaleQty:0, rawTotalAvgSaleQty:0, orderAllocation:0 })
  const acc = locationMap.get(r.location)
  acc.totalInvt+=r.totalInvt; acc.rawInvt+=r.rawInvt; acc.rawBlockedInvt+=r.rawBlockedInvt; acc.rtdInvt+=r.rtdInvt
  acc.rawAvgSaleQty+=r.rawAvgSaleQty; acc.rawTotalAvgSaleQty+=r.rawTotalAvgSaleQty; acc.orderAllocation+=r.orderAllocation
}
const locations = sortByLocationOrder([...locationMap.values()].filter(l => l.location !== 'Unmapped').map(l => {
  const avgSale = Math.ceil(l.rawAvgSaleQty/daysInRange)
  const totalAvgSale = Math.ceil(l.rawTotalAvgSaleQty/daysInRange)
  const denominator = Math.ceil(Math.max(avgSale, l.orderAllocation))
  const doi = l.totalInvt>0 && denominator===0 ? null : (denominator>0 ? Math.floor(l.totalInvt/denominator) : 0)
  return { ...l, avgSale, totalAvgSale, doi, allocationPct: totalAvgSale>0?(l.orderAllocation/totalAvgSale)*100:null, stockStatus: doi==null?stockStatus(0,avgSale,l.totalInvt,{}):stockStatus(doi,avgSale,l.totalInvt,{}) }
}), l => l.location)

// Dead/slow stock — sub-category rollup (same structure as api/inventory.js)
const DEAD_STOCK_DOI = 200, SLOW_MOVING_DOI = 45, SUBCAT_QTY_FLOOR = 50
const subCatMap = new Map()
for (const s of skus) {
  const key = `${s.category}|${s.subCategory}`
  if (!subCatMap.has(key)) subCatMap.set(key, { category: s.category, subCategory: s.subCategory, totalInvt: 0, avgSale: 0, skuList: [] })
  const acc = subCatMap.get(key)
  acc.totalInvt += s.totalInvt; acc.avgSale += s.avgSale; acc.skuList.push(s)
}
const subCatRows = [...subCatMap.values()]
  .filter(sc => sc.totalInvt > SUBCAT_QTY_FLOOR && !sc.subCategory?.toLowerCase().startsWith('sparepart'))
  .map(sc => {
    const notBeingSold = sc.avgSale <= 0
    const doi = notBeingSold ? Math.round(sc.totalInvt) : Math.floor(sc.totalInvt / sc.avgSale)
    return {
      category: sc.category, subCategory: sc.subCategory,
      totalInvt: Math.round(sc.totalInvt), avgSale: +sc.avgSale.toFixed(2), doi, notBeingSold,
      skus: sc.skuList.filter(s => s.totalInvt > 0)
        .map(s => ({ sku: s.sku, totalInvt: Math.round(s.totalInvt), avgSale: +s.avgSale.toFixed(2), doi: s.avgSale > 0 ? s.doi : Math.round(s.totalInvt) }))
        .sort((a,b) => b.totalInvt - a.totalInvt),
    }
  })
const deadStock = subCatRows.filter(sc => (sc.notBeingSold && sc.totalInvt > DEAD_STOCK_DOI) || sc.doi > DEAD_STOCK_DOI).sort((a,b) => b.totalInvt - a.totalInvt)
const slowMoving = subCatRows.filter(sc => sc.notBeingSold || sc.doi > SLOW_MOVING_DOI).sort((a,b) => b.totalInvt - a.totalInvt)

// Lead time risk
const leadTimeRisk = skus.filter(s => s.productSource && s.productSource !== 'Inhouse' && s.leadTime>0 && s.doi!=null && s.totalInvt>0)
  .map(s => ({ sku: s.sku, category: s.category, leadTime: s.leadTime, productSource: s.productSource, doi: s.doi, stockStatus: s.stockStatus, avgSale: s.avgSale }))
  .filter(s => s.doi <= s.leadTime+10).sort((a,b) => (a.doi-a.leadTime)-(b.doi-b.leadTime)).slice(0, 20)

// Pivot
const liveFacilities = [...facilityToStatus.entries()].filter(([,s]) => s==='Live').map(([f]) => f)
const filterOptions = {
  categories: [...new Set(skus.map(s=>s.category))].sort(),
  subCategories: [...new Set(skus.map(s=>s.subCategory))].sort(),
  locations: sortByLocationOrder([...new Set(liveFacilities.map(f=>facilityToLocation.get(f)).filter(Boolean))]),
  stockStatuses: STOCK_STATUS_VALUES,
  rtdLevels: ['Low','Sufficient'],
  facilityTypes: [...new Set(liveFacilities.map(f=>facilityToType.get(f)))].sort(),
  facilities: liveFacilities.map(f => ({ facility:f, displayName:facilityToDisplayName.get(f)||f, location:facilityToLocation.get(f), facilityType:facilityToType.get(f) })).sort((a,b)=>a.location.localeCompare(b.location)||a.facility.localeCompare(b.facility)),
  productIds: skus.map(s=>({sku:s.sku, category:s.category})).sort((a,b)=>a.sku.localeCompare(b.sku)),
}
const pivotLocations = sortByLocationOrder([...new Set(skus.flatMap(s=>s.locations.map(l=>l.location)))])
const pivotRows = skus.map(s => ({
  sku: s.sku, category: s.category, subCategory: s.subCategory,
  totalInvt: Math.round(s.totalInvt), avgSale: s.avgSale,
  byLocation: Object.fromEntries(s.locations.map(l=>[l.location,{totalInvt:Math.round(l.totalInvt),avgSale:l.avgSale}])),
}))

const payload = {
  asOf: new Date().toISOString(),
  avgSaleWindow: { start, end },
  lastSalesDateConsidered: maxSalesDate,
  lastSnapshotUpdated,
  summary: {
    totalInvt: Math.round(totalInvt), rawInvt: Math.round(totalRaw), rawBlockedInvt: Math.round(totalRawBlocked),
    rtdInvt: Math.round(totalRtd), avgSale: Math.round(totalAvgSaleB2C), avgSaleB2C: Math.round(totalAvgSaleB2C),
    totalAvgSale: Math.round(totalAvgSaleAll), doi: compDOI, stockStatus: dominantStatus, skuCount: skus.length,
    criticalLowCount: skus.filter(s=>s.stockStatus==='Critical'||s.stockStatus==='Low').length,
    deadStockCount: deadStock.length, deadStockUnits: deadStock.reduce((s,d)=>s+d.totalInvt,0),
  },
  statusBreakdown: Object.entries(statusCounts).map(([status,count])=>({status,count})),
  locations, leadTimeRisk, deadStock, slowMoving,
  pivot: { locations: pivotLocations, rows: pivotRows },
  filterOptions,
  skus,
}

const json = JSON.stringify(payload)
writeFileSync('public/inv-data.json', json)
console.log(`Written public/inv-data.json — ${(json.length/1024).toFixed(0)}KB, ${skus.length} SKUs`)

db.release()
await pool.end()
