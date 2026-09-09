// Runs in GitHub Actions — fetches all data from Supabase, computes the full
// inventory payload for 7d/15d/30d windows, writes 3 static JSON files to public/.

import pkg from 'pg'
import { writeFileSync } from 'fs'
import {
  buildFacilityMaps, norm, normSku, cleanLabel, computeRowInventory,
  stockStatus, requiredStock, rtdLevel, parseLaunchDate, isNewLaunch, isPseudoSku,
  isB2CChannel, isTotalAvgSaleChannel, buildSkuMap,
  resolveMasterSkuKey, sortByLocationOrder,
} from '../api/_inventory_shared.js'
import { getBQ } from '../api/_bq.js'

const { Pool } = pkg
const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
})

const DEAD_STOCK_DOI = 200, SLOW_MOVING_DOI = 45, SUBCAT_QTY_FLOOR = 50
const STOCK_STATUS_VALUES = ['Critical', 'Low', 'Sufficient', 'Excess', 'Out of Stock', 'Dead / No Sale', 'No Demand']

const db = await pool.connect()

// Use the actual max sales date — data is complete since Uniware syncs previous day's batch
const { rows: maxDateRows } = await db.query(`SELECT MAX(order_date) AS max_date FROM sales_window`)
const rawMax = maxDateRows[0]?.max_date
const end = rawMax instanceof Date ? rawMax.toISOString().slice(0, 10) : String(rawMax).slice(0, 10)
console.log(`Latest sales date in DB: ${end} → using end=${end}`)

// Fetch all tables once — reused across all 3 window computations
console.log('Fetching all tables from Supabase in parallel...')
const t0 = Date.now()
const [c1,c2,c3,c4,c5,c6] = await Promise.all([1,2,3,4,5,6].map(() => pool.connect()))
const [r1,r2,r3,r4,r5,r6] = await Promise.all([
  c1.query(`SELECT item_sku_code AS "ItemSkuCode", facility AS "Facility", updated AS "Updated", inventory AS "Inventory", inventory_blocked AS "InventoryBlocked" FROM inv_snapshot`),
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

// Inventory aggregation — keyed by (SKU, Facility), NOT (SKU, Location). A Location (city)
// can host more than one Facility of different Facility Types (e.g. a Regular facility and a
// non-Regular one in the same city) — collapsing to Location here would make the Facility Type
// filter downstream unable to distinguish them, silently including the wrong facility's stock
// whenever "Regular" (or any other type) is selected. Facility Type is carried on each entry so
// it survives into the per-SKU facility breakdown; Location-level rollups for display are
// derived FROM this facility-level data, after any Facility Type filtering has been applied.
const invBySkuFacility = new Map()
for (const row of baseLiveInvRows) {
  const { key, finalSku } = resolveMasterSkuKey(row.ItemSkuCode, skuMap)
  if (!key) continue
  const loc = facilityToLocation.get(row.Facility) || 'Unmapped'
  const facilityType = facilityToType.get(row.Facility) || 'Regular'
  const { totalInventory, rawInvt, rawBlockedInvt, rtdInvt } = computeRowInventory(row)
  const mapKey = `${key}|${row.Facility}`
  if (!invBySkuFacility.has(mapKey)) invBySkuFacility.set(mapKey, { sku: finalSku, skuKey: key, location: loc, facility: row.Facility, facilityType, totalInvt: 0, rawInvt: 0, rawBlockedInvt: 0, rtdInvt: 0 })
  const acc = invBySkuFacility.get(mapKey)
  acc.totalInvt += totalInventory; acc.rawInvt += rawInvt; acc.rawBlockedInvt += rawBlockedInvt; acc.rtdInvt += rtdInvt
}

// Roll up to (SKU, Location) for the main aggregation path
const invBySkuLoc = new Map()
for (const [, entry] of invBySkuFacility) {
  const mapKey = `${entry.skuKey}|${entry.location}`
  if (!invBySkuLoc.has(mapKey)) invBySkuLoc.set(mapKey, { sku: entry.sku, skuKey: entry.skuKey, location: entry.location, totalInvt: 0, rawInvt: 0, rawBlockedInvt: 0, rtdInvt: 0, facilities: [] })
  const acc = invBySkuLoc.get(mapKey)
  acc.totalInvt += entry.totalInvt; acc.rawInvt += entry.rawInvt; acc.rawBlockedInvt += entry.rawBlockedInvt; acc.rtdInvt += entry.rtdInvt
  acc.facilities.push({ facility: entry.facility, facilityType: entry.facilityType, totalInvt: entry.totalInvt, rawInvt: entry.rawInvt, rawBlockedInvt: entry.rawBlockedInvt, rtdInvt: entry.rtdInvt })
}

const cleanSalesRowsAll = salesRows.filter(row => !isPseudoSku(row.final_sku))

// ── Mobility & Ergo Furniture — independent Avg Sale table ──────────────────────────────
// These SKUs (electric wheelchairs especially) don't fit the standard 7-day-average model:
// orders are real demand even when later Cancelled/RTO'd (dispatch delays on low-stock SKUs
// cause 30-40% of genuine orders to fall through — so unlike everywhere else, nothing is
// excluded here), some sell only 3-4x/week even with healthy stock, and newly-launched
// SKUs have a ramp-up period that would understate their current pace if averaged from launch.
// sales_window (Supabase) only retains ~15 days of history — far too short — so this section
// queries BigQuery directly for the 180-day lookback it actually needs, once, shared across all
// 3 window files below (this table's numbers don't depend on the 7d/15d/30d Avg Sale Window
// toggle at all — it's driven entirely by this SKU's own selling history, not the page filter).
const MOBILITY_ERGO_LOOKBACK_DAYS = 180
const MOBILITY_ERGO_MIN_WINDOW_DAYS = 7
const MOBILITY_ERGO_RATIO_FLOOR = 0.4
const MOBILITY_ERGO_RATIO_CEIL = 2.5

async function computeMobilityErgoAvgSale() {
  const bq = getBQ()
  const [rows] = await bq.query({
    query: `
      SELECT masterskucode AS sku, Category AS category, SubCategory AS subCategory,
        CAST(OrderDate AS STRING) AS date, SUM(ItemQty) AS units
      FROM \`frido-429506.production.fact_all_platform_sales_report\`
      WHERE Category IN ('Mobility', 'Ergo Furniture')
        AND OrderDate >= DATE_SUB(CURRENT_DATE(), INTERVAL ${MOBILITY_ERGO_LOOKBACK_DAYS} DAY)
        AND OrderDate < CURRENT_DATE()
        AND Country = 'India'
        AND masterskucode IS NOT NULL AND TRIM(masterskucode) != ''
      GROUP BY sku, category, subCategory, date
      ORDER BY sku, date
    `,
  })

  const bySku = new Map()
  for (const r of rows) {
    const sku = r.sku
    if (!bySku.has(sku)) bySku.set(sku, { category: cleanLabel(r.category) || 'Uncategorized', subCategory: cleanLabel(r.subCategory) || 'Uncategorized', days: [] })
    bySku.get(sku).days.push({ date: r.date, units: Number(r.units) })
  }

  // Current (incomplete) calendar week is excluded from the walk-back — its partial total
  // would otherwise look like a demand drop and immediately halt the walk-back at week 1.
  const todayWeekStart = new Date()
  todayWeekStart.setDate(todayWeekStart.getDate() - todayWeekStart.getDay())
  const todayWeekKey = todayWeekStart.toISOString().slice(0, 10)

  const weeklyBuckets = days => {
    const weekly = new Map()
    for (const d of days) {
      const dt = new Date(d.date)
      const weekStart = new Date(dt); weekStart.setDate(dt.getDate() - dt.getDay())
      const key = weekStart.toISOString().slice(0, 10)
      weekly.set(key, (weekly.get(key) || 0) + d.units)
    }
    return [...weekly.entries()].filter(([wk]) => wk < todayWeekKey).sort(([a], [b]) => a.localeCompare(b)).map(([week, units]) => ({ week, units }))
  }

  // Walks backward from the most recent complete week, keeping a running trailing average of
  // included weeks — stops the moment a week falls outside [40%, 250%] of that trailing average
  // (confirmed against real SKU histories: correctly trims launch ramp-ups like a wheelchair
  // that sold ~1 unit/week for its first 2 months before settling into steady demand, while
  // leaving genuinely steady sellers' windows spanning their full history untouched).
  const findNormalWindow = weeks => {
    if (weeks.length === 0) return []
    const included = [weeks[weeks.length - 1]]
    let trailingAvg = included[0].units
    for (let i = weeks.length - 2; i >= 0; i--) {
      const w = weeks[i]
      const ratio = trailingAvg > 0 ? w.units / trailingAvg : (w.units > 0 ? Infinity : 1)
      if (ratio < MOBILITY_ERGO_RATIO_FLOOR || ratio > MOBILITY_ERGO_RATIO_CEIL) break
      included.unshift(w)
      trailingAvg = included.reduce((s, x) => s + x.units, 0) / included.length
    }
    return included
  }

  const results = []
  for (const [sku, v] of bySku) {
    const days = v.days.filter(d => d.date < todayWeekKey || true) // all days; weekly bucketing below drops the incomplete week
    if (!days.length) continue
    days.sort((a, b) => a.date.localeCompare(b.date))
    const lifeStart = days[0].date, lifeEnd = days[days.length - 1].date
    const lifeDays = Math.round((new Date(lifeEnd) - new Date(lifeStart)) / 86400000) + 1
    const fullLifeUnits = days.reduce((s, d) => s + d.units, 0)
    const avgSaleCurrent = lifeDays > 0 ? fullLifeUnits / lifeDays : 0

    const weeks = weeklyBuckets(days)
    const includedWeeks = findNormalWindow(weeks)
    let windowDays, windowStart, windowEnd, windowUnits
    if (includedWeeks.length > 0) {
      // Calendar days actually spanned by the included weeks (not weeks.length*7 — a week
      // bucket can hold as little as 1 real sale day for a short-lived SKU, e.g. a SKU whose
      // entire life is a single day inside that calendar week; claiming a full 7 days for it
      // would understate avgSaleNew far below what it actually sold at on its one active day).
      windowStart = includedWeeks[0].week
      const lastWeekEnd = new Date(includedWeeks[includedWeeks.length - 1].week)
      lastWeekEnd.setDate(lastWeekEnd.getDate() + 6)
      windowEnd = lastWeekEnd.toISOString().slice(0, 10)
      const spanDays = Math.round((new Date(windowEnd) - new Date(windowStart)) / 86400000) + 1
      windowDays = Math.min(spanDays, lifeDays)
      windowUnits = includedWeeks.reduce((s, w) => s + w.units, 0)
    } else {
      windowDays = 0
    }
    if (windowDays < MOBILITY_ERGO_MIN_WINDOW_DAYS) {
      // Floor case: either no complete week of history exists yet, or the SKU's real life is
      // shorter than the 7-day floor itself — never pad the window past the SKU's own lifeDays,
      // just use its full (short) life as-is.
      windowDays = Math.min(MOBILITY_ERGO_MIN_WINDOW_DAYS, lifeDays)
      windowStart = lifeStart; windowEnd = lifeEnd
      windowUnits = fullLifeUnits
    }
    const avgSaleNew = windowDays > 0 ? windowUnits / windowDays : 0

    results.push({
      sku, category: v.category, subCategory: v.subCategory,
      lifeStart, lifeEnd, lifeDays,
      windowStart: windowStart || lifeStart, windowEnd: windowEnd || lifeEnd, windowDays,
      avgSaleNew, avgSaleCurrent,
    })
  }
  return results
}

const mobilityErgoRaw = await computeMobilityErgoAvgSale()
console.log(`Mobility & Ergo Furniture Avg Sale: computed for ${mobilityErgoRaw.length} SKUs (${MOBILITY_ERGO_LOOKBACK_DAYS}d lookback)`)

// All-location inventory per SKU (unfiltered by location/facility type, per this table's
// "independent, overall — no location split" requirement) — reuses the same live-facility
// inventory rows every other calculation in this file is built from, just summed without a
// location dimension.
const invBySkuAllLoc = new Map()
for (const [, entry] of invBySkuFacility) {
  if (!invBySkuAllLoc.has(entry.skuKey)) invBySkuAllLoc.set(entry.skuKey, { totalInvt: 0, rawInvt: 0, rawBlockedInvt: 0, rtdInvt: 0 })
  const acc = invBySkuAllLoc.get(entry.skuKey)
  acc.totalInvt += entry.totalInvt; acc.rawInvt += entry.rawInvt; acc.rawBlockedInvt += entry.rawBlockedInvt; acc.rtdInvt += entry.rtdInvt
}

const mobilityErgoAvgSale = mobilityErgoRaw.map(r => {
  const skuKey = normSku(r.sku)
  const inv = invBySkuAllLoc.get(skuKey) || { totalInvt: 0, rawInvt: 0, rawBlockedInvt: 0, rtdInvt: 0 }
  const last90 = lastSaleBySkuKey.get(skuKey)
  const master = itemMaster.get(skuKey)
  const newLaunch = isNewLaunch(master?.launchDate, new Date())
  const isDead = inv.totalInvt > 0 && (last90?.qty90d || 0) === 0 && !newLaunch
  const doi = r.avgSaleNew > 0 ? Math.floor(inv.totalInvt / r.avgSaleNew) : (inv.totalInvt > 0 ? null : 0)
  return {
    sku: r.sku, category: r.category, subCategory: r.subCategory,
    totalInvt: Math.round(inv.totalInvt), rawInvt: Math.round(inv.rawInvt), rawBlockedInvt: Math.round(inv.rawBlockedInvt), rtdInvt: Math.round(inv.rtdInvt),
    lifeStart: r.lifeStart, lifeEnd: r.lifeEnd, lifeDays: r.lifeDays,
    windowStart: r.windowStart, windowEnd: r.windowEnd, windowDays: r.windowDays,
    avgSaleNew: +r.avgSaleNew.toFixed(2), avgSaleCurrent: +r.avgSaleCurrent.toFixed(2),
    doi,
    stockStatus: doi == null ? stockStatus(0, r.avgSaleNew, inv.totalInvt, { isDead }) : stockStatus(doi, r.avgSaleNew, inv.totalInvt, { isDead }),
    isDead,
    websiteStatus: liveOnWebsite.has(skuKey) ? 'Live' : 'Stock Out',
  }
}).sort((a, b) => b.totalInvt - a.totalInvt)

function computePayload(windowDays) {
  const startDate = new Date(end)
  startDate.setDate(startDate.getDate() - (windowDays - 1))
  const start = startDate.toISOString().slice(0, 10)
  const endDateObj = new Date(end)

  const cleanSalesRows = cleanSalesRowsAll.filter(row => {
    const ds = toDateStr(row.order_date?.value || row.order_date)
    return ds >= start && ds <= end
  })
  console.log(`  [${windowDays}d] Sales rows in range: ${cleanSalesRows.length} (${start} → ${end})`)

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

  // Facility-level rows: inventory is genuinely per-facility (invBySkuFacility), but sales/
  // allocation are only ever attributed at Location grain (nearest-warehouse-by-state has no
  // facility identity) — so every facility within the same Location shares that Location's
  // avgSale/allocation figures. This is the best granularity the sales data supports; it does
  // NOT affect the Facility Type bug fix, which is about INVENTORY being wrongly pooled across
  // facility types within a location, not about sales attribution.
  const allFacilityKeys = new Set(invBySkuFacility.keys())
  const skuFacilityRows = []
  for (const mapKey of allFacilityKeys) {
    const invEntry = invBySkuFacility.get(mapKey)
    const { skuKey, location: loc, facility, facilityType } = invEntry
    const totalInvt = invEntry.totalInvt || 0
    const rawInvt = invEntry.rawInvt || 0
    const rawBlockedInvt = invEntry.rawBlockedInvt || 0
    const rtdInvt = invEntry.rtdInvt || 0
    const sku = invEntry.sku || skuKey
    const locKey = `${skuKey}|${loc}`
    const rawQty = avgSaleBySkuLoc.get(locKey) || 0
    const avgSale = Math.ceil(rawQty / windowDays)
    const rawTotalQty = totalAvgSaleBySkuLoc.get(locKey) || 0
    const totalAvgSale = Math.ceil(rawTotalQty / windowDays)
    const orderAllocation = (allocBySkuLoc.get(locKey) || 0) / windowDays
    const denominator = Math.ceil(Math.max(avgSale, orderAllocation))
    const doi = totalInvt > 0 && denominator === 0 ? null : (denominator > 0 ? Math.floor(totalInvt / denominator) : 0)
    const master = itemMaster.get(skuKey)
    const last90 = lastSaleBySkuKey.get(skuKey)
    const newLaunch = isNewLaunch(master?.launchDate, endDateObj)
    const isDead = totalInvt > 0 && (last90?.qty90d || 0) === 0 && !newLaunch
    skuFacilityRows.push({
      sku, skuKey, location: loc, facility, facilityType,
      category: master?.category || 'Uncategorized',
      subCategory: master?.subCategory || 'Uncategorized',
      totalInvt, rawInvt, rawBlockedInvt, rtdInvt,
      facilities: invEntry?.facilities || [],
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
  // skuLocRows: rolled up from facility grain to (SKU, Location) — used below for the
  // company-wide Location cards, which show ALL facility types combined by default. Facility
  // Type filtering (done client-side / in api/inventory.js) operates on skuFacilityRows'
  // `facility`/`facilityType` fields directly, not on this pre-rolled view.
  // doi/stockStatus must be recomputed AFTER totalInvt is fully summed across every facility at
  // this location — spreading them in from whichever facility row happened to be inserted first
  // (the old `{ ...r, totalInvt: 0, ... }` pattern) left them permanently stale against a
  // different facility's totalInvt (often 0, if that facility was seen first), producing rows
  // like totalInvt=90 / doi=0 / stockStatus="Out of Stock" once the real total was summed in.
  const skuLocMap = new Map()
  for (const r of skuFacilityRows) {
    const locKey = `${r.skuKey}|${r.location}`
    if (!skuLocMap.has(locKey)) skuLocMap.set(locKey, { ...r, totalInvt: 0, rawInvt: 0, rawBlockedInvt: 0, rtdInvt: 0 })
    const acc = skuLocMap.get(locKey)
    acc.totalInvt += r.totalInvt; acc.rawInvt += r.rawInvt; acc.rawBlockedInvt += r.rawBlockedInvt; acc.rtdInvt += r.rtdInvt
  }
  // Recompute doi/isDead/stockStatus/rtdLevel/requiredStock/thirtyDayReq/inventoryShort for
  // each (sku, location) using the summed totalInvt — the initial spread from the first
  // facility row can carry a stale totalInvt=0 (and everything derived from it) from whichever
  // facility happened to be inserted first, before the real per-location total was summed in.
  const skuLocRows = [...skuLocMap.values()].map(r => {
    const denominator = Math.ceil(Math.max(r.avgSale, r.orderAllocation))
    const doi = r.totalInvt > 0 && denominator === 0 ? null : (denominator > 0 ? Math.floor(r.totalInvt / denominator) : 0)
    const master = itemMaster.get(r.skuKey)
    const last90 = lastSaleBySkuKey.get(r.skuKey)
    const newLaunch = isNewLaunch(master?.launchDate, endDateObj)
    const isDead = r.totalInvt > 0 && (last90?.qty90d || 0) === 0 && !newLaunch
    return {
      ...r, doi, isDead,
      thirtyDayReq: Math.round(r.avgSale * 30), inventoryShort: Math.round(r.avgSale * 30 - r.totalInvt),
      rtdLevel: rtdLevel(r.rtdInvt, r.avgSale),
      stockStatus: doi == null ? stockStatus(0, r.avgSale, r.totalInvt, { isDead }) : stockStatus(doi, r.avgSale, r.totalInvt, { isDead }),
      requiredStock: Math.round(requiredStock(r.avgSale, master?.leadTime || 0, master?.productSource || null, r.totalInvt)),
    }
  })

  const rolledSkuMap = new Map()
  for (const r of skuFacilityRows) {
    if (!rolledSkuMap.has(r.skuKey)) {
      rolledSkuMap.set(r.skuKey, {
        sku: r.sku, skuKey: r.skuKey, category: r.category, subCategory: r.subCategory,
        totalInvt: 0, rawInvt: 0, rawBlockedInvt: 0, rtdInvt: 0, rawAvgSaleQty: 0, rawTotalAvgSaleQty: 0, orderAllocation: 0,
        leadTime: r.leadTime, productSource: r.productSource, newLaunch: r.newLaunch, lastSaleDate: r.lastSaleDate,
        locations: [], facilities: [],
      })
    }
    const acc = rolledSkuMap.get(r.skuKey)
    acc.totalInvt += r.totalInvt; acc.rawInvt += r.rawInvt; acc.rawBlockedInvt += r.rawBlockedInvt; acc.rtdInvt += r.rtdInvt
    // rawAvgSaleQty/rawTotalAvgSaleQty/orderAllocation are Location-grain, not Facility-grain —
    // summing per facility row here would double/triple-count a location with several
    // facilities, since every facility row for that location repeats the SAME location sales
    // figures. Accumulate them once per (sku, location) instead, via skuLocRows below.
    acc.facilities.push({ location: r.location, facility: r.facility, facilityType: r.facilityType, totalInvt: r.totalInvt, rawInvt: r.rawInvt, rawBlockedInvt: r.rawBlockedInvt, rtdInvt: r.rtdInvt })
  }
  for (const r of skuLocRows) {
    const acc = rolledSkuMap.get(r.skuKey)
    if (!acc) continue
    acc.rawAvgSaleQty += r.rawAvgSaleQty; acc.rawTotalAvgSaleQty += r.rawTotalAvgSaleQty; acc.orderAllocation += r.orderAllocation
    acc.locations.push({ location: r.location, totalInvt: r.totalInvt, rawInvt: r.rawInvt, rawBlockedInvt: r.rawBlockedInvt, rtdInvt: r.rtdInvt, avgSale: r.avgSale, doi: r.doi, stockStatus: r.stockStatus, facilities: r.facilities })
  }

  let skus = [...rolledSkuMap.values()].map(s => {
    const avgSale = Math.ceil(s.rawAvgSaleQty / windowDays)
    const totalAvgSale = Math.ceil(s.rawTotalAvgSaleQty / windowDays)
    const denominator = Math.ceil(Math.max(avgSale, s.orderAllocation))
    const doi = s.totalInvt > 0 && denominator === 0 ? null : (denominator > 0 ? Math.floor(s.totalInvt / denominator) : 0)
    // SKU-wide dead check: no sale ANYWHERE in the trailing 90d and not a recent launch — same
    // rule used at the facility/location grain above (lines 273/349/392). The previous
    // "every location must independently read Dead/No Sale or Out of Stock" rule undercounted:
    // a SKU selling a trickle at just one of several warehouses escaped the dead-stock count
    // entirely, even though most of its inventory was genuinely stagnant elsewhere.
    const skuMaster = itemMaster.get(s.skuKey)
    const skuLast90 = lastSaleBySkuKey.get(s.skuKey)
    const skuNewLaunch = isNewLaunch(skuMaster?.launchDate, endDateObj)
    const isDead = s.totalInvt > 0 && (skuLast90?.qty90d || 0) === 0 && !skuNewLaunch
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
  }).sort((a, b) => b.totalInvt - a.totalInvt).filter(s => s.category !== 'Uncategorized')

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

  const locationMap = new Map()
  for (const r of skuLocRows) {
    if (!locationMap.has(r.location)) locationMap.set(r.location, { location: r.location, totalInvt:0, rawInvt:0, rawBlockedInvt:0, rtdInvt:0, rawAvgSaleQty:0, rawTotalAvgSaleQty:0, orderAllocation:0 })
    const acc = locationMap.get(r.location)
    acc.totalInvt+=r.totalInvt; acc.rawInvt+=r.rawInvt; acc.rawBlockedInvt+=r.rawBlockedInvt; acc.rtdInvt+=r.rtdInvt
    acc.rawAvgSaleQty+=r.rawAvgSaleQty; acc.rawTotalAvgSaleQty+=r.rawTotalAvgSaleQty; acc.orderAllocation+=r.orderAllocation
  }
  const locations = sortByLocationOrder([...locationMap.values()].filter(l => l.location !== 'Unmapped').map(l => {
    const avgSale = Math.ceil(l.rawAvgSaleQty/windowDays)
    const totalAvgSale = Math.ceil(l.rawTotalAvgSaleQty/windowDays)
    const denominator = Math.ceil(Math.max(avgSale, l.orderAllocation))
    const doi = l.totalInvt>0 && denominator===0 ? null : (denominator>0 ? Math.floor(l.totalInvt/denominator) : 0)
    return { ...l, avgSale, totalAvgSale, doi, allocationPct: totalAvgSale>0?(l.orderAllocation/totalAvgSale)*100:null, stockStatus: doi==null?stockStatus(0,avgSale,l.totalInvt,{}):stockStatus(doi,avgSale,l.totalInvt,{}) }
  }), l => l.location)

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
  const leadTimeRisk = skus.filter(s => s.productSource && s.productSource !== 'Inhouse' && s.leadTime>0 && s.doi!=null && s.totalInvt>0 && s.doi<=s.leadTime+10)
    .map(s => ({ sku: s.sku, category: s.category, leadTime: s.leadTime, productSource: s.productSource, doi: s.doi, stockStatus: s.stockStatus, avgSale: s.avgSale }))
    .sort((a,b) => (a.doi-a.leadTime)-(b.doi-b.leadTime)).slice(0, 20)

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

  return {
    asOf: new Date().toISOString(), avgSaleWindowDays: windowDays,
    avgSaleWindow: { start, end },
    lastSalesDateConsidered: end, lastSnapshotUpdated,
    summary: {
      totalInvt: Math.round(totalInvt), rawInvt: Math.round(totalRaw), rawBlockedInvt: Math.round(totalRawBlocked),
      rtdInvt: Math.round(totalRtd), avgSale: Math.round(totalAvgSaleB2C), avgSaleB2C: Math.round(totalAvgSaleB2C),
      totalAvgSale: Math.round(totalAvgSaleAll), doi: compDOI, stockStatus: dominantStatus, skuCount: skus.length,
      criticalLowCount: skus.filter(s=>s.stockStatus==='Critical'||s.stockStatus==='Low').length,
      // SKU-level isDead (no sale in trailing 90d), NOT the deadStock array below (a separate
      // sub-category-level DOI>200 rollup used only by the "Dead Stock Sub-categories" table) —
      // using the sub-category definition here previously made this KPI tile disagree with the
      // "Dead / No Sale" bucket in statusBreakdown for the exact same cached data (49/235K vs
      // 250/50K units), and disagreed with src/InventoryPage.jsx's OWN filtered-view recompute
      // (which already used isDead), so the number would silently change definition the moment
      // any filter was touched. Both consumers of this tile now agree unconditionally.
      deadStockCount: skus.filter(s=>s.isDead).length, deadStockUnits: skus.filter(s=>s.isDead).reduce((s,r)=>s+r.totalInvt,0),
    },
    statusBreakdown: Object.entries(statusCounts).map(([status,count])=>({status,count})),
    locations, leadTimeRisk, deadStock, slowMoving,
    pivot: { locations: pivotLocations, rows: pivotRows },
    filterOptions, skus,
    // Independent of windowDays — this table's Avg Sale is driven entirely by each SKU's own
    // 180-day selling history, not the page's 7d/15d/30d Avg Sale Window toggle. Computed once
    // above and attached identically to all 3 files.
    mobilityErgoAvgSale,
  }
}

for (const days of [7, 15, 30]) {
  console.log(`\nComputing ${days}d window...`)
  const payload = computePayload(days)
  const json = JSON.stringify(payload)
  writeFileSync(`public/inv-data-${days}d.json`, json)
  console.log(`Written public/inv-data-${days}d.json — ${(json.length/1024).toFixed(0)}KB, ${payload.skus.length} SKUs`)
}

db.release()
await pool.end()
