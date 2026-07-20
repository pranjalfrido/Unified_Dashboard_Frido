import { getBQ } from './_bq.js'
import {
  buildFacilityMaps, norm, normSku, cleanLabel, computeRowInventory,
  stockStatus, requiredStock, rtdLevel, parseLaunchDate, isNewLaunch, isPseudoSku, REORDER_POINT_DOI,
  isB2CChannel, isTotalAvgSaleChannel, buildSkuMap, resolveMasterSkuKey, sortByLocationOrder,
} from './_inventory_shared.js'

const DEAD_STOCK_WINDOW_DAYS = 90
// Avg Sale anchors to the latest date that actually has sales data, not the requested
// `end` — the pipeline can lag by a day or more, and a same-day/partial row would
// otherwise silently drag the average down. Extra days are fetched beyond the requested
// range so that anchor-date search always has enough history to fall back through.
const SALES_LOOKBACK_BUFFER_DAYS = 5
// Fixed enum of every possible stockStatus() output — see _inventory_shared.js — kept static
// so the Stock Status slicer always offers every option regardless of other active filters.
const STOCK_STATUS_VALUES = ['Critical', 'Low', 'Sufficient', 'Excess', 'Out of Stock', 'Dead / No Sale', 'No Demand']

function matchesMulti(value, filterCsv) {
  if (!filterCsv) return true
  const vals = filterCsv.split(',').map(v => v.trim()).filter(Boolean)
  return vals.length === 0 || vals.includes(value)
}
function splitCsv(v) {
  return v ? v.split(',').map(x => x.trim()).filter(Boolean) : null
}

export default async function inventoryHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    start, end, category, subCategory, location, facility, facilityType,
    stockStatus: stockStatusFilter, productId, rtdLevel: rtdLevelFilter, avgSaleWindowDays,
  } = req.body
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end date' })
  // Avg Sale's lookback window is independently selectable (7/15/30d) from the sidebar,
  // decoupled from `daysInRange` (the fetched date range, fixed at 7d on this tab) — this
  // is the number of FULL days averaged once the latest/possibly-partial sales date is
  // excluded (see the anchoring logic below).
  const avgSaleWindowDaysVal = Math.max(1, Math.min(90, parseInt(avgSaleWindowDays, 10) || 7))

  try {
    const bq = getBQ()
    const { facilityToLocation, facilityToType, facilityToStatus, facilityToDisplayName, stateToNearestWH, channelToDescription } = buildFacilityMaps()

    const daysInRange = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
    const endDate = new Date(end)
    const deadStockCutoff = new Date(endDate); deadStockCutoff.setDate(deadStockCutoff.getDate() - DEAD_STOCK_WINDOW_DAYS)
    const deadStockCutoffStr = deadStockCutoff.toISOString().slice(0, 10)
    // Widen the sales fetch to cover the largest of: the default lookback buffer, or the
    // requested Avg Sale window (+1 day for the excluded/possibly-partial anchor date).
    const salesFetchLookbackDays = Math.max(SALES_LOOKBACK_BUFFER_DAYS, avgSaleWindowDaysVal + 1)
    const salesFetchStart = new Date(start); salesFetchStart.setDate(salesFetchStart.getDate() - salesFetchLookbackDays)
    const salesFetchStartStr = salesFetchStart.toISOString().slice(0, 10)

    const [[invRows], [salesRows], [lastSaleRows], [itemMasterRows], [skuMappingRows]] = await Promise.all([
      // The raw snapshot table accumulates one row per sync run (hundreds of duplicate
      // rows per SKU+Facility over time) — dedupe to the latest per (ItemSkuCode, Facility),
      // same logic the original Power BI source query used. Note: that query read the
      // "_in"-suffixed columns, but those are now 100% NULL in this table (the pipeline's
      // column convention has since drifted) — "_st" is where live data actually is today,
      // confirmed by direct inspection, so we read that instead.
      bq.query({
        query: `WITH deduplicated_inventory AS (
                  SELECT *,
                    ROW_NUMBER() OVER (
                      PARTITION BY ItemSkuCode, Facility
                      ORDER BY Updated DESC, _daton_batch_runtime DESC
                    ) AS rn
                  FROM \`frido-429506.Frido_BigQuery.Frido_Unicommerce_3_Inventory_Snapshot_Inventory_Snapshot\`
                )
                SELECT
                  ItemSkuCode, Facility, Updated,
                  SAFE_CAST(Inventory_st AS FLOAT64) AS Inventory,
                  SAFE_CAST(InventoryBlocked_st AS FLOAT64) AS InventoryBlocked
                FROM deduplicated_inventory
                WHERE rn = 1`,
        maximumBytesBilled: '5000000000',
      }),
      // Pulls a few extra lookback days beyond the requested range (SALES_LOOKBACK_BUFFER_DAYS)
      // so the "true anchor date" logic below always has enough history even when the pipeline
      // is a couple of days behind — see anchoredSalesRange.
      bq.query({
        query: `SELECT final_sku, Facility, state, channel, order_date, SUM(total_quantity) AS qty
                FROM \`frido-429506.production.aggregated_uniware_sales_report\`
                WHERE order_date BETWEEN '${salesFetchStartStr}' AND '${end}'
                GROUP BY final_sku, Facility, state, channel, order_date`,
        maximumBytesBilled: '5000000000',
      }),
      // Independent of the selected range — always the trailing 90d window, for dead-stock detection.
      bq.query({
        query: `SELECT final_sku, MAX(order_date) AS last_sale_date, SUM(total_quantity) AS qty_90d
                FROM \`frido-429506.production.aggregated_uniware_sales_report\`
                WHERE order_date BETWEEN '${deadStockCutoffStr}' AND '${end}'
                GROUP BY final_sku`,
        maximumBytesBilled: '5000000000',
      }),
      bq.query({
        query: `SELECT Product_Code, Category_Name, Sub_category, Lead_Time, Product_Source, SKU_First_Sales_Date, Type
                FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\``,
        maximumBytesBilled: '1000000000',
      }),
      // ProductId -> Master SKU — duplicate/alias SKUs created at inward time (e.g. a
      // stand-in code used for the same physical product) collapse to one master SKU
      // here, BEFORE the item-master lookup below. See resolveMasterSkuKey.
      bq.query({
        query: `SELECT DISTINCT TRIM(productid) AS productid, TRIM(masterskucode) AS masterskucode
                FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\`
                WHERE TRIM(masterskucode) NOT IN ('', 'not found')`,
        maximumBytesBilled: '1000000000',
      }),
    ])

    const skuMap = buildSkuMap(skuMappingRows)

    // ── Item master lookup, keyed by normalized SKU ──────────────────────────
    const itemMaster = new Map()
    for (const r of itemMasterRows) {
      if (!r.Product_Code) continue
      // Bundles are multi-component kits, not physical stock at the component level —
      // this dashboard reports simple/component-level SKUs only. "Combo" is a bundle-only
      // category (kept as a belt-and-suspenders exclusion alongside the Type check).
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

    // ── Last snapshot update — completely slicer-independent, computed off the raw
    // inventory rows before any facility/location/attribute filter is applied. ──
    let lastSnapshotUpdated = null
    for (const row of invRows) {
      const upd = row.Updated?.value || row.Updated
      if (upd && (!lastSnapshotUpdated || upd > lastSnapshotUpdated)) lastSnapshotUpdated = upd
    }

    // ── Last-sale-in-90d lookup (dead stock detection, independent of selected range) ──
    // Merged (not overwritten) across raw codes that resolve to the same master SKU.
    const lastSaleBySkuKey = new Map()
    for (const r of lastSaleRows) {
      const { key } = resolveMasterSkuKey(r.final_sku, skuMap)
      if (!key) continue
      const rowDate = r.last_sale_date?.value || r.last_sale_date
      const rowQty = Number(r.qty_90d || 0)
      const existing = lastSaleBySkuKey.get(key)
      if (!existing) {
        lastSaleBySkuKey.set(key, { lastSaleDate: rowDate, qty90d: rowQty })
      } else {
        existing.qty90d += rowQty
        if (rowDate && (!existing.lastSaleDate || rowDate > existing.lastSaleDate)) existing.lastSaleDate = rowDate
      }
    }

    // ── Facility-level filters (always applied — these scope which physical stock counts at all) ──
    // "Not Live" facilities hold virtual/non-operational inventory and never count, regardless
    // of any slicer. Facility/FacilityType slicers narrow this further. Location is handled
    // separately below because the pivot table needs a location-unfiltered pass too.
    const facilityFilterVals = splitCsv(facility)
    const facilityTypeFilterVals = splitCsv(facilityType)
    const baseLiveInvRows = invRows.filter(row => {
      if (isPseudoSku(row.ItemSkuCode)) return false
      if (facilityToStatus.get(row.Facility) !== 'Live') return false
      if (facilityFilterVals && !facilityFilterVals.includes(row.Facility)) return false
      if (facilityTypeFilterVals && !facilityTypeFilterVals.includes(facilityToType.get(row.Facility))) return false
      return true
    })
    const cleanSalesRowsUnanchored = salesRows.filter(row => !isPseudoSku(row.final_sku))

    // ── Anchor Avg Sale to the latest date that actually has sales data ──────────
    // The pipeline can lag by a day (or more) behind "today," and a same-day row that's
    // only partially landed would otherwise silently drag the average down. So: find the
    // max order_date present anywhere in the fetched window, always exclude that date
    // itself (treat it as potentially partial), then use the `avgSaleWindowDaysVal` days
    // immediately before it. If even that latest date is stale by multiple days (e.g. a
    // 2-day pipeline gap), the window simply shifts back with it — exactly the same rule,
    // no special-casing for "how many days behind."
    let maxSalesDate = null
    for (const row of cleanSalesRowsUnanchored) {
      const d = row.order_date?.value || row.order_date
      if (d && (!maxSalesDate || d > maxSalesDate)) maxSalesDate = d
    }
    let avgSaleWindowStartStr = start, avgSaleWindowEndStr = end
    if (maxSalesDate) {
      const anchorEnd = new Date(maxSalesDate); anchorEnd.setDate(anchorEnd.getDate() - 1)
      const anchorStart = new Date(anchorEnd); anchorStart.setDate(anchorStart.getDate() - (avgSaleWindowDaysVal - 1))
      avgSaleWindowEndStr = anchorEnd.toISOString().slice(0, 10)
      avgSaleWindowStartStr = anchorStart.toISOString().slice(0, 10)
    }
    const cleanSalesRows = cleanSalesRowsUnanchored.filter(row => {
      const d = row.order_date?.value || row.order_date
      return d >= avgSaleWindowStartStr && d <= avgSaleWindowEndStr
    })

    const locationFilterVals = splitCsv(location)

    // ── Core aggregation, parameterized so it can run with or without the location filter ──
    // (the pivot table needs every location visible regardless of what's selected in the slicer).
    function aggregate({ respectLocationFilter }) {
      const liveInvRows = respectLocationFilter && locationFilterVals
        ? baseLiveInvRows.filter(row => locationFilterVals.includes(facilityToLocation.get(row.Facility) || 'Unmapped'))
        : baseLiveInvRows

      const invBySkuLoc = new Map()
      let lastUpdated = null
      for (const row of liveInvRows) {
        const { key, finalSku } = resolveMasterSkuKey(row.ItemSkuCode, skuMap)
        if (!key) continue
        const loc = facilityToLocation.get(row.Facility) || 'Unmapped'
        const { totalInventory, rawInvt, rawBlockedInvt, rtdInvt } = computeRowInventory(row)
        const mapKey = `${key}|${loc}`
        if (!invBySkuLoc.has(mapKey)) {
          invBySkuLoc.set(mapKey, { sku: finalSku, skuKey: key, location: loc, totalInvt: 0, rawInvt: 0, rawBlockedInvt: 0, rtdInvt: 0 })
        }
        const acc = invBySkuLoc.get(mapKey)
        acc.totalInvt += totalInventory
        acc.rawInvt += rawInvt
        acc.rawBlockedInvt += rawBlockedInvt
        acc.rtdInvt += rtdInvt
        const upd = row.Updated?.value || row.Updated
        if (upd && (!lastUpdated || upd > lastUpdated)) lastUpdated = upd
      }

      // ── Sales: Avg_Sale (region-based, B2C-only — drives every downstream calc) ──
      // and a separate all-channel total (B2C+B2B+POs) kept only for the "Total Avg Sale" KPI —
      // and Order_Allocation (facility-based, all channels).
      const avgSaleBySkuLoc = new Map() // B2C-only — the primary "avg sale" used everywhere
      // "All channels" here means B2C Order + B2B Order + Purchase Order only — real demand
      // channels, not every uniware_channels value. Stock transfer/Ignore/Custom (e.g. VAS,
      // which maps to "Ignore") aren't sales and must not inflate this figure.
      const totalAvgSaleBySkuLoc = new Map()
      const allocBySkuLoc = new Map()
      for (const row of cleanSalesRows) {
        const { key } = resolveMasterSkuKey(row.final_sku, skuMap)
        if (!key) continue
        const qty = Number(row.qty || 0)
        const isB2C = isB2CChannel(row.channel, channelToDescription)
        const countsTowardTotal = isTotalAvgSaleChannel(row.channel, channelToDescription)

        const nearestWH = stateToNearestWH.get(norm(row.state))
        if (nearestWH && (!respectLocationFilter || !locationFilterVals || locationFilterVals.includes(nearestWH))) {
          const mapKey = `${key}|${nearestWH}`
          if (countsTowardTotal) totalAvgSaleBySkuLoc.set(mapKey, (totalAvgSaleBySkuLoc.get(mapKey) || 0) + qty)
          if (isB2C) avgSaleBySkuLoc.set(mapKey, (avgSaleBySkuLoc.get(mapKey) || 0) + qty)
        }

        const facilityLocation = facilityToLocation.get(row.Facility)
        if (facilityLocation && (!respectLocationFilter || !locationFilterVals || locationFilterVals.includes(facilityLocation))) {
          const mapKey = `${key}|${facilityLocation}`
          allocBySkuLoc.set(mapKey, (allocBySkuLoc.get(mapKey) || 0) + qty)
        }
      }

      // ── Merge into SKU x Location rows ───────────────────────────────────────
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

        // avgSale is B2C-only — the basis for every DOI/status/required-stock calc below.
        // Raw (unrounded) qty is carried alongside so roll-ups (SKU-level, location-level)
        // can sum the RAW totals and round once, rather than summing already-rounded
        // per-location averages — summing rounded values compounds ceil() error upward
        // (e.g. 7 locations each rounded up by <1 unit adds up to +7, not +1).
        const rawQty = avgSaleBySkuLoc.get(mapKey) || 0
        const avgSale = Math.ceil(rawQty / avgSaleWindowDaysVal)
        const rawTotalQty = totalAvgSaleBySkuLoc.get(mapKey) || 0
        const totalAvgSale = Math.ceil(rawTotalQty / avgSaleWindowDaysVal)
        const orderAllocation = (allocBySkuLoc.get(mapKey) || 0) / avgSaleWindowDaysVal
        const denominator = Math.ceil(Math.max(avgSale, orderAllocation))
        const doi = totalInvt > 0 && denominator === 0 ? null : (denominator > 0 ? Math.floor(totalInvt / denominator) : 0)
        const thirtyDayReq = Math.round(avgSale * 30)
        const inventoryShort = Math.round(thirtyDayReq - totalInvt)
        // Allocation % — actual order allocation to this facility ÷ actual regional (B2C) sale,
        // same definition as the Warehouse Health cards — but here at SKU × location grain, so it
        // reads as "is this SKU over/under-allocated at this specific location."
        const allocationPct = avgSale > 0 ? (orderAllocation / avgSale) * 100 : null

        const master = itemMaster.get(skuKey)
        const leadTime = master?.leadTime || 0
        const productSource = master?.productSource || null

        const last90 = lastSaleBySkuKey.get(skuKey)
        const newLaunch = isNewLaunch(master?.launchDate, endDate)
        const isDead = totalInvt > 0 && (last90?.qty90d || 0) === 0 && !newLaunch

        skuLocRows.push({
          sku, skuKey, location: loc,
          category: master?.category || 'Uncategorized',
          subCategory: master?.subCategory || 'Uncategorized',
          totalInvt, rawInvt, rawBlockedInvt, rtdInvt,
          avgSale, rawAvgSaleQty: rawQty, totalAvgSale, rawTotalAvgSaleQty: rawTotalQty, orderAllocation, allocationPct,
          doi, thirtyDayReq, inventoryShort,
          rtdLevel: rtdLevel(rtdInvt, avgSale),
          stockStatus: doi == null ? stockStatus(0, avgSale, totalInvt, { isDead }) : stockStatus(doi, avgSale, totalInvt, { isDead }),
          requiredStock: Math.round(requiredStock(avgSale, leadTime, productSource, totalInvt)),
          leadTime, productSource, newLaunch, isDead,
          lastSaleDate: last90?.lastSaleDate || null,
        })
      }

      // ── Roll up to SKU level (across whichever locations survived the filter) ──
      const rolledSkuMap = new Map()
      for (const r of skuLocRows) {
        if (!rolledSkuMap.has(r.skuKey)) {
          rolledSkuMap.set(r.skuKey, {
            sku: r.sku, skuKey: r.skuKey, category: r.category, subCategory: r.subCategory,
            totalInvt: 0, rawInvt: 0, rawBlockedInvt: 0, rtdInvt: 0, rawAvgSaleQty: 0, rawTotalAvgSaleQty: 0, orderAllocation: 0,
            leadTime: r.leadTime, productSource: r.productSource, newLaunch: r.newLaunch,
            lastSaleDate: r.lastSaleDate,
            locations: [],
          })
        }
        const acc = rolledSkuMap.get(r.skuKey)
        acc.totalInvt += r.totalInvt
        acc.rawInvt += r.rawInvt
        acc.rawBlockedInvt += r.rawBlockedInvt
        acc.rtdInvt += r.rtdInvt
        // Sum the RAW (unrounded) qty across locations, not the per-location rounded
        // avgSale/totalAvgSale — see the rawAvgSaleQty comment above skuLocRows.push(...).
        acc.rawAvgSaleQty += r.rawAvgSaleQty
        acc.rawTotalAvgSaleQty += r.rawTotalAvgSaleQty
        acc.orderAllocation += r.orderAllocation
        acc.locations.push({
          location: r.location, totalInvt: r.totalInvt, rawInvt: r.rawInvt, rawBlockedInvt: r.rawBlockedInvt, rtdInvt: r.rtdInvt,
          avgSale: r.avgSale, totalAvgSale: r.totalAvgSale, orderAllocation: r.orderAllocation, allocationPct: r.allocationPct,
          doi: r.doi, stockStatus: r.stockStatus, rtdLevel: r.rtdLevel,
          thirtyDayReq: r.thirtyDayReq, inventoryShort: r.inventoryShort, requiredStock: r.requiredStock,
        })
      }

      let rolled = [...rolledSkuMap.values()].map(s => {
        const avgSale = Math.ceil(s.rawAvgSaleQty / avgSaleWindowDaysVal)
        const totalAvgSale = Math.ceil(s.rawTotalAvgSaleQty / avgSaleWindowDaysVal)
        const denominator = Math.ceil(Math.max(avgSale, s.orderAllocation))
        const doi = s.totalInvt > 0 && denominator === 0 ? null : (denominator > 0 ? Math.floor(s.totalInvt / denominator) : 0)
        const isDead = s.totalInvt > 0 && !s.locations.some(l => l.stockStatus !== 'Dead / No Sale' && l.stockStatus !== 'Out of Stock') && s.locations.some(l => l.stockStatus === 'Dead / No Sale')
        const status = doi == null ? stockStatus(0, avgSale, s.totalInvt, { isDead }) : stockStatus(doi, avgSale, s.totalInvt, { isDead })
        const daysSinceLastSale = s.lastSaleDate ? Math.round((endDate - new Date(s.lastSaleDate)) / 86400000) : null
        const thirtyDayReq = Math.round(avgSale * 30)
        const inventoryShort = Math.round(thirtyDayReq - s.totalInvt)
        // Blended allocation % across every location this SKU sits in — mirrors DOI's
        // rolled-up-vs-per-location split (see acc.locations above for the per-location figure).
        const allocationPct = avgSale > 0 ? (s.orderAllocation / avgSale) * 100 : null
        return {
          ...s,
          avgSale, totalAvgSale,
          doi, allocationPct, stockStatus: status, isDead, daysSinceLastSale,
          thirtyDayReq, inventoryShort,
          rtdLevel: rtdLevel(s.rtdInvt, avgSale),
          requiredStock: Math.round(requiredStock(avgSale, s.leadTime, s.productSource, s.totalInvt)),
          locations: sortByLocationOrder(s.locations, l => l.location),
        }
      }).sort((a, b) => b.totalInvt - a.totalInvt)

      // Drop SKUs with no item-master match ("Uncategorized") — not real, identifiable products.
      rolled = rolled.filter(s => s.category !== 'Uncategorized')

      return { skus: rolled, skuLocRows, lastUpdated }
    }

    const scoped = aggregate({ respectLocationFilter: true })
    let skus = scoped.skus
    const skuLocRows = scoped.skuLocRows

    // ── Filter option lists, computed BEFORE attribute filters are applied, so dropdowns don't shrink ──
    const liveFacilities = [...facilityToStatus.entries()].filter(([, status]) => status === 'Live').map(([f]) => f)
    const filterOptions = {
      categories: [...new Set(skus.map(s => s.category))].sort(),
      subCategories: [...new Set(skus.map(s => s.subCategory))].sort(),
      // Locations/stock statuses are filter CRITERIA lists, not "what's left after filtering" —
      // derived from all live facilities (unaffected by the Facility/Facility Type slicers), the
      // same way facilities/facilityTypes already are, so selecting one slicer doesn't blank out another.
      locations: sortByLocationOrder([...new Set(liveFacilities.map(f => facilityToLocation.get(f)).filter(Boolean))]),
      stockStatuses: STOCK_STATUS_VALUES,
      rtdLevels: ['Low', 'Sufficient'],
      facilityTypes: [...new Set(liveFacilities.map(f => facilityToType.get(f)))].sort(),
      facilities: liveFacilities.map(f => ({
        facility: f,
        displayName: facilityToDisplayName.get(f) || f,
        location: facilityToLocation.get(f),
        facilityType: facilityToType.get(f),
      })).sort((a, b) => a.location.localeCompare(b.location) || a.facility.localeCompare(b.facility)),
      productIds: skus.map(s => ({ sku: s.sku, category: s.category })).sort((a, b) => a.sku.localeCompare(b.sku)),
    }

    // ── Apply attribute filters (server-side, so the payload itself shrinks) ───────────
    if (category) skus = skus.filter(s => matchesMulti(s.category, category))
    if (subCategory) skus = skus.filter(s => matchesMulti(s.subCategory, subCategory))
    if (stockStatusFilter) skus = skus.filter(s => matchesMulti(s.stockStatus, stockStatusFilter))
    if (rtdLevelFilter) skus = skus.filter(s => matchesMulti(s.rtdLevel, rtdLevelFilter))
    if (productId) skus = skus.filter(s => matchesMulti(s.sku, productId))

    // Every downstream view (Location tiles, Warehouse Health, status breakdown) must
    // reflect these same attribute filters — scope skuLocRows to the SKUs that survived.
    const survivingSkuKeys = new Set(skus.map(s => s.skuKey))
    const scopedSkuLocRows = skuLocRows.filter(r => survivingSkuKeys.has(r.skuKey))

    // ── Summary KPIs ──────────────────────────────────────────────────────────
    const totalInvt = skus.reduce((sum, s) => sum + s.totalInvt, 0)
    const totalRaw = skus.reduce((sum, s) => sum + s.rawInvt, 0)
    const totalRawBlocked = skus.reduce((sum, s) => sum + s.rawBlockedInvt, 0)
    const totalRtd = skus.reduce((sum, s) => sum + s.rtdInvt, 0)
    const totalAvgSaleB2C = skus.reduce((sum, s) => sum + s.avgSale, 0)
    const totalAvgSaleAllChannels = skus.reduce((sum, s) => sum + s.totalAvgSale, 0)
    const companyDenominator = Math.ceil(Math.max(totalAvgSaleB2C, skus.reduce((sum, s) => sum + s.orderAllocation, 0)))
    const companyDOI = companyDenominator > 0 ? Math.floor(totalInvt / companyDenominator) : 0

    const statusCounts = {}
    for (const s of skus) statusCounts[s.stockStatus] = (statusCounts[s.stockStatus] || 0) + 1
    // Dominant/aggregate stock-health status across the whole brand — the most common
    // status among currently-filtered SKUs (B2C-avg-sale basis, per the KPI's corner note).
    let dominantStatus = null, dominantCount = -1
    for (const [status, count] of Object.entries(statusCounts)) {
      if (count > dominantCount) { dominantStatus = status; dominantCount = count }
    }

    // ── Per-location rollup (for the warehouse health grid + Location tiles) ──
    // Scoped to the exact same SKU set as the main table (category/subCategory/
    // stockStatus/rtdLevel/productId filters all apply here too).
    const locationMap = new Map()
    for (const r of scopedSkuLocRows) {
      if (!locationMap.has(r.location)) locationMap.set(r.location, { location: r.location, totalInvt: 0, rawInvt: 0, rawBlockedInvt: 0, rtdInvt: 0, rawAvgSaleQty: 0, rawTotalAvgSaleQty: 0, orderAllocation: 0 })
      const acc = locationMap.get(r.location)
      acc.totalInvt += r.totalInvt
      acc.rawInvt += r.rawInvt
      acc.rawBlockedInvt += r.rawBlockedInvt
      acc.rtdInvt += r.rtdInvt
      // Sum RAW qty across every SKU at this location, not each SKU's already-rounded
      // avgSale/totalAvgSale — same reasoning as the SKU roll-up above.
      acc.rawAvgSaleQty += r.rawAvgSaleQty
      acc.rawTotalAvgSaleQty += r.rawTotalAvgSaleQty
      acc.orderAllocation += r.orderAllocation
    }
    const locations = sortByLocationOrder([...locationMap.values()].filter(l => l.location !== 'Unmapped').map(l => {
      const avgSale = Math.ceil(l.rawAvgSaleQty / avgSaleWindowDaysVal)
      const totalAvgSale = Math.ceil(l.rawTotalAvgSaleQty / avgSaleWindowDaysVal)
      const denominator = Math.ceil(Math.max(avgSale, l.orderAllocation))
      const doi = l.totalInvt > 0 && denominator === 0 ? null : (denominator > 0 ? Math.floor(l.totalInvt / denominator) : 0)
      // Allocation % — actual order allocation to this facility ÷ actual regional (B2C) sale.
      const allocationPct = avgSale > 0 ? (l.orderAllocation / avgSale) * 100 : null
      return { ...l, avgSale, totalAvgSale, doi, allocationPct, stockStatus: doi == null ? stockStatus(0, avgSale, l.totalInvt, {}) : stockStatus(doi, avgSale, l.totalInvt, {}) }
    }), l => l.location)

    // ── Lead-time risk: imported/outsourced SKUs with low DOI ─────────────────
    const leadTimeRisk = skus
      .filter(s => s.productSource && s.productSource !== 'Inhouse' && s.leadTime > 0 && s.doi != null && s.totalInvt > 0)
      .map(s => ({ sku: s.sku, category: s.category, leadTime: s.leadTime, productSource: s.productSource, doi: s.doi, stockStatus: s.stockStatus, avgSale: s.avgSale }))
      .filter(s => s.doi <= s.leadTime + 10)
      .sort((a, b) => (a.doi - a.leadTime) - (b.doi - b.leadTime))
      .slice(0, 20)

    // ── Slow-moving / Dead stock: rolled up to sub-category, expandable to SKU ──
    // Sub-category DOI = blended totalInvt / avgSale across the sub-category. When
    // avgSale is 0 (not being sold), there's no meaningful days-of-inventory number —
    // per product decision, DOI is shown as the total inventory qty itself in that case,
    // and the row automatically qualifies for both lists (an unsold SKU is both slow-moving
    // and dead stock candidate) as long as it clears the qty floor.
    const SLOW_MOVING_DOI = 45
    const DEAD_STOCK_DOI = 100
    const SUBCAT_QTY_FLOOR = 50

    const subCatMap = new Map() // key: category|subCategory
    for (const s of skus) {
      const key = `${s.category}|${s.subCategory}`
      if (!subCatMap.has(key)) subCatMap.set(key, { category: s.category, subCategory: s.subCategory, totalInvt: 0, avgSale: 0, skus: [] })
      const acc = subCatMap.get(key)
      acc.totalInvt += s.totalInvt
      acc.avgSale += s.avgSale
      acc.skus.push(s)
    }
    const subCatRows = [...subCatMap.values()]
      .filter(sc => sc.totalInvt > SUBCAT_QTY_FLOOR)
      .map(sc => {
        const notBeingSold = sc.avgSale <= 0
        const doi = notBeingSold ? Math.round(sc.totalInvt) : Math.floor(sc.totalInvt / sc.avgSale)
        return {
          category: sc.category, subCategory: sc.subCategory,
          totalInvt: Math.round(sc.totalInvt), avgSale: +sc.avgSale.toFixed(2), doi, notBeingSold,
          skus: sc.skus
            .filter(s => s.totalInvt > 0)
            .map(s => ({
              sku: s.sku, totalInvt: Math.round(s.totalInvt), avgSale: +s.avgSale.toFixed(2),
              doi: s.avgSale > 0 ? s.doi : Math.round(s.totalInvt),
            }))
            .sort((a, b) => b.totalInvt - a.totalInvt),
        }
      })

    const slowMoving = subCatRows
      .filter(sc => sc.notBeingSold || sc.doi > SLOW_MOVING_DOI)
      .sort((a, b) => b.totalInvt - a.totalInvt)
    const deadStock = subCatRows
      .filter(sc => sc.notBeingSold || sc.doi > DEAD_STOCK_DOI)
      .sort((a, b) => b.totalInvt - a.totalInvt)

    // ── Pivot: Category > Sub-category > SKU rows, Location columns ──────────
    // Always reflects every location, regardless of the Location slicer — built from a
    // second aggregation pass that skips the location filter but keeps every other one
    // (facility, facilityType, category, subCategory, productId, stockStatus, rtdLevel)
    // in sync with the main table.
    let pivotSkus = aggregate({ respectLocationFilter: false }).skus
    if (category) pivotSkus = pivotSkus.filter(s => matchesMulti(s.category, category))
    if (subCategory) pivotSkus = pivotSkus.filter(s => matchesMulti(s.subCategory, subCategory))
    if (stockStatusFilter) pivotSkus = pivotSkus.filter(s => matchesMulti(s.stockStatus, stockStatusFilter))
    if (rtdLevelFilter) pivotSkus = pivotSkus.filter(s => matchesMulti(s.rtdLevel, rtdLevelFilter))
    if (productId) pivotSkus = pivotSkus.filter(s => matchesMulti(s.sku, productId))

    const pivotLocations = sortByLocationOrder([...new Set(pivotSkus.flatMap(s => s.locations.map(l => l.location)))])
    const pivotRows = pivotSkus.map(s => ({
      sku: s.sku, category: s.category, subCategory: s.subCategory,
      totalInvt: Math.round(s.totalInvt), avgSale: s.avgSale,
      byLocation: Object.fromEntries(s.locations.map(l => [l.location, { totalInvt: Math.round(l.totalInvt), avgSale: l.avgSale }])),
    }))

    res.json({
      asOf: lastSnapshotUpdated,
      lastSalesDate: maxSalesDate,
      avgSaleWindowDays: avgSaleWindowDaysVal,
      avgSaleWindow: { start: avgSaleWindowStartStr, end: avgSaleWindowEndStr },
      dateRange: { start, end, days: daysInRange },
      deadStockWindowDays: DEAD_STOCK_WINDOW_DAYS,
      reorderPointDoi: REORDER_POINT_DOI,
      filterOptions,
      summary: {
        totalInvt: Math.round(totalInvt),
        rawInvt: Math.round(totalRaw),
        rawBlockedInvt: Math.round(totalRawBlocked),
        rtdInvt: Math.round(totalRtd),
        avgSale: Math.round(totalAvgSaleB2C),
        avgSaleB2C: Math.round(totalAvgSaleB2C),
        totalAvgSale: Math.round(totalAvgSaleAllChannels),
        doi: companyDOI,
        stockStatus: dominantStatus,
        skuCount: skus.length,
        criticalLowCount: skus.filter(s => s.stockStatus === 'Critical' || s.stockStatus === 'Low').length,
        deadStockCount: deadStock.length,
        deadStockUnits: deadStock.reduce((s, d) => s + d.totalInvt, 0),
      },
      statusBreakdown: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
      locations,
      leadTimeRisk,
      deadStock,
      slowMoving,
      pivot: { locations: pivotLocations, rows: pivotRows },
      skus,
    })
  } catch (e) {
    console.error('[inventory]', e.message)
    res.status(500).json({ error: e.message })
  }
}
