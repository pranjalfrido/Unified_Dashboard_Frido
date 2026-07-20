import { getBQ } from './_bq.js'
import { buildFacilityMaps, norm, normSku, cleanLabel, computeRowInventory, isPseudoSku, buildSkuMap, resolveMasterSkuKey, sortByLocationOrder } from './_inventory_shared.js'

// BigQuery NUMERIC columns come back as {value: "123.45"} objects, not plain numbers.
const num = v => {
  if (v == null) return 0
  if (typeof v === 'object' && v.value !== undefined) return parseFloat(v.value) || 0
  return Number(v) || 0
}

function matchesMulti(value, filterCsv) {
  if (!filterCsv) return true
  const vals = filterCsv.split(',').map(v => v.trim()).filter(Boolean)
  return vals.length === 0 || vals.includes(value)
}
function splitCsv(v) {
  return v ? v.split(',').map(x => x.trim()).filter(Boolean) : null
}

// Weekly/monthly bucket keys — ISO week (Mon start) and calendar month.
function weekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = (d.getUTCDay() + 6) % 7 // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}
function monthKey(dateStr) { return dateStr.slice(0, 7) }

export default async function salesAllocationHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    start, end, category, subCategory, sku, channel: channelFilter, channelType, facility, region: regionFilter,
    comparePrevious, momentumWindow, topN,
  } = req.body
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end date' })
  const topNVal = Math.max(1, Math.min(50, parseInt(topN, 10) || 10))

  try {
    const bq = getBQ()
    const { facilityToLocation, facilityToDisplayName, facilityToStatus, stateToRegion, locationToRegion, channelToUnified, channelToDescription } = buildFacilityMaps()
    const daysInRange = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
    const N = Math.max(1, Math.min(90, parseInt(momentumWindow, 10) || 7))

    // Previous period: same length, immediately preceding the selected range.
    const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1)
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - daysInRange + 1)
    const prevStartStr = prevStart.toISOString().slice(0, 10), prevEndStr = prevEnd.toISOString().slice(0, 10)

    // Widen the raw pull to cover whichever momentum window is requested (so "last day vs
    // Nth-last day" always has data even when N exceeds the selected range).
    const momentumLookback = new Date(start); momentumLookback.setDate(momentumLookback.getDate() - N)
    const fetchStartStr = momentumLookback < prevStart ? momentumLookback.toISOString().slice(0, 10) : start

    const queries = [
      bq.query({
        query: `SELECT final_sku, Facility, state, channel, order_date, SUM(total_quantity) AS qty, SUM(total_revenue) AS rev
                FROM \`frido-429506.production.aggregated_uniware_sales_report\`
                WHERE order_date BETWEEN '${fetchStartStr}' AND '${end}'
                GROUP BY final_sku, Facility, state, channel, order_date`,
        maximumBytesBilled: '5000000000',
      }),
      bq.query({
        query: `SELECT Product_Code, Category_Name, Sub_category, Type
                FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\``,
        maximumBytesBilled: '1000000000',
      }),
      // Same dedupe + "_st" column correction as api/inventory.js — see that file for why.
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
                  ItemSkuCode, Facility,
                  SAFE_CAST(Inventory_st AS FLOAT64) AS Inventory,
                  SAFE_CAST(InventoryBlocked_st AS FLOAT64) AS InventoryBlocked
                FROM deduplicated_inventory
                WHERE rn = 1`,
        maximumBytesBilled: '5000000000',
      }),
      // ProductId -> Master SKU — see api/_inventory_shared.js resolveMasterSkuKey for why
      // this has to run before item-master lookup.
      bq.query({
        query: `SELECT DISTINCT TRIM(productid) AS productid, TRIM(masterskucode) AS masterskucode
                FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\`
                WHERE TRIM(masterskucode) NOT IN ('', 'not found')`,
        maximumBytesBilled: '1000000000',
      }),
    ]
    if (comparePrevious) {
      queries.push(bq.query({
        query: `SELECT SUM(total_quantity) AS qty, SUM(total_revenue) AS rev
                FROM \`frido-429506.production.aggregated_uniware_sales_report\`
                WHERE order_date BETWEEN '${prevStartStr}' AND '${prevEndStr}'`,
        maximumBytesBilled: '5000000000',
      }))
    }
    const [[salesRows], [itemMasterRows], [invRows], [skuMappingRows], prevResult] = await Promise.all(queries)
    const skuMap = buildSkuMap(skuMappingRows)

    // Latest date actually holding sales data within the fetched range — the pipeline can
    // lag a day (or more) behind "today," so a same-day/partial row can be present without
    // being a complete day. Reported to the UI as "last date considered" (that date minus
    // one, i.e. the last FULL day the numbers on this page reflect) — same rule as the
    // Inventory Health page's Avg Sale anchoring.
    let maxSalesDate = null
    for (const row of salesRows) {
      const d = row.order_date?.value || row.order_date
      if (d && (!maxSalesDate || d > maxSalesDate)) maxSalesDate = d
    }
    let lastSalesDateConsidered = null
    if (maxSalesDate) {
      const d = new Date(maxSalesDate); d.setDate(d.getDate() - 1)
      lastSalesDateConsidered = d.toISOString().slice(0, 10)
    }

    const itemMaster = new Map()
    for (const r of itemMasterRows) {
      if (!r.Product_Code) continue
      // Bundles are multi-component kits, not physical stock at the component level —
      // this dashboard reports simple/component-level SKUs only. "Combo" is a bundle-only
      // category (kept as a belt-and-suspenders exclusion alongside the Type check).
      if (norm(r.Type) === 'BUNDLE') continue
      if (norm(r.Category_Name) === 'COMBO') continue
      itemMaster.set(normSku(r.Product_Code), { category: cleanLabel(r.Category_Name) || 'Uncategorized', subCategory: cleanLabel(r.Sub_category) || 'Uncategorized' })
    }

    // Current total inventory per SKU (for dead-stock / mover cross-reference).
    // Only "Live" facilities count — matches the Inventory Health page's correction.
    // SKUs with no item-master match ("Uncategorized") are dropped too — not real,
    // identifiable products.
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

    const skuFilterVals = splitCsv(sku)
    const facilityFilterVals = splitCsv(facility)

    // ── Apply filters (category resolved via item master, channel/region/facility via ref maps) ──
    // channelType filters on channel_description (B2C Order / B2B Order / Purchase Order /
    // Stock transfer / Ignore / Custom) — the roadmap's "channel type" split.
    function passesFilters(r) {
      if (isPseudoSku(r.final_sku)) return false
      const { key: resolvedKey } = resolveMasterSkuKey(r.final_sku, skuMap)
      const master = itemMaster.get(resolvedKey)
      if (!master) return false
      if (category && !matchesMulti(master.category, category)) return false
      if (subCategory && !matchesMulti(master.subCategory, subCategory)) return false
      if (skuFilterVals && !skuFilterVals.includes(r.final_sku)) return false
      if (facilityFilterVals && !facilityFilterVals.includes(r.Facility)) return false
      if (channelFilter) {
        const unified = norm(channelToUnified.get(norm(r.channel)) || r.channel || 'Unknown')
        if (!matchesMulti(unified, channelFilter)) return false
      }
      if (channelType) {
        const desc = channelToDescription.get(norm(r.channel)) || 'Unknown'
        if (!matchesMulti(desc, channelType)) return false
      }
      if (regionFilter) {
        const demandRegion = stateToRegion.get(norm(r.state))
        if (!matchesMulti(demandRegion, regionFilter)) return false
      }
      return true
    }

    // Full range (>= start) — used for everything except momentum, which needs the lookback window too.
    const rangeRows = salesRows.filter(r => {
      const date = r.order_date?.value || r.order_date
      return date >= start && passesFilters(r)
    })
    // Lookback range (>= fetchStartStr) — momentum only, so an N-day comparison always has its anchor day.
    const lookbackRows = salesRows.filter(passesFilters)

    // ── Daily trend (+ per-SKU daily, for momentum) ──────────────────────────────
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

    // Weekly / monthly rollups of the same daily series — trend granularity toggle on the frontend.
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

    const skuDailyMap = new Map() // skuKey -> Map(date -> qty), built off the lookback range
    for (const r of lookbackRows) {
      const date = r.order_date?.value || r.order_date
      if (!date) continue
      const { key } = resolveMasterSkuKey(r.final_sku, skuMap)
      if (!skuDailyMap.has(key)) skuDailyMap.set(key, new Map())
      const perDate = skuDailyMap.get(key)
      perDate.set(date, (perDate.get(date) || 0) + Number(r.qty || 0))
    }
    const lookbackDates = [...new Set(lookbackRows.map(r => r.order_date?.value || r.order_date))].filter(Boolean).sort()

    // ── Momentum: generalized N-day comparison (last day vs Nth-last day), ranked risers/fallers ──
    // N is a request parameter (default 7) rather than two hardcoded windows, per roadmap 2.7 —
    // the frontend can request any window and get back a consistently-shaped result.
    function momentumFor(windowN) {
      if (lookbackDates.length < windowN + 1) return { risers: [], fallers: [], lastDate: null, compareDate: null }
      const lastDate = lookbackDates[lookbackDates.length - 1]
      const compareDate = lookbackDates[lookbackDates.length - 1 - windowN]
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
    const momentum = { requested: momentumFor(N), '2day': momentumFor(2), '7day': momentumFor(7) }

    // ── Channel x Location allocation matrix (qty) ──────────────────────────────
    const matrixMap = new Map() // key: location|channel
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
      for (const channel of channelSet) {
        const v = matrixMap.get(`${location}|${channel}`) || 0
        row[channel] = v
        rowTotal += v
      }
      row._total = rowTotal
      return row
    }), r => r.location)
    const topChannels = [...channelSet].map(channel => ({
      channel, total: [...matrixMap.entries()].filter(([k]) => k.endsWith(`|${channel}`)).reduce((s, [, v]) => s + v, 0),
    })).sort((a, b) => b.total - a.total).slice(0, 8).map(c => c.channel)

    // ── Channel-wise sales: revenue + qty by unified channel, and by channel type ──
    // (roadmap 2.5 — "split by unified channel and channel type, trended over the range")
    const channelSalesMap = new Map()
    const channelTypeMap = new Map()
    const channelTrendMap = new Map() // date|channel -> {qty, rev}
    for (const r of rangeRows) {
      const unified = norm(channelToUnified.get(norm(r.channel)) || r.channel || 'Unknown')
      const type = channelToDescription.get(norm(r.channel)) || 'Unknown'
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
      for (const ch of topChannelNames) {
        const v = channelTrendMap.get(`${date}|${ch}`)
        point[ch] = v ? v.qty : 0
      }
      return point
    })

    // ── Region demand vs allocation, and Fill Rate % ──────────────────────────
    // Fill Rate = orders that landed in the region-correct facility ÷ total orders for that region.
    // No order-level id exists in this pre-aggregated table, so quantity is used as the unit of
    // measure throughout (consistent with how Order_Allocation was defined in the original model).
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
      return {
        region,
        demand: Math.round(demand / daysInRange),
        allocation: Math.round(alloc / daysInRange),
        fillRate: demand > 0 ? Math.min(1, alloc / demand) : null,
      }
    }).sort((a, b) => (b.demand + b.allocation) - (a.demand + a.allocation))

    // ── Facility-location allocation % (roadmap 2.6) ────────────────────────────
    // Allocation % = orders landed at a facility's location ÷ total orders originating from
    // that location's mapped region — i.e. how much of a region's demand a given WH is absorbing.
    const facilityQty = new Map() // location -> qty allocated there
    for (const r of rangeRows) {
      const location = facilityToLocation.get(r.Facility)
      if (!location) continue
      facilityQty.set(location, (facilityQty.get(location) || 0) + Number(r.qty || 0))
    }
    let facilityAllocation = [...facilityQty.entries()].map(([location, qty]) => {
      const region = locationToRegion.get(location)
      const regionTotalDemand = region ? (regionDemand.get(region) || 0) : 0
      return {
        location,
        region: region || null,
        qty: Math.round(qty),
        qtyPerDay: Math.round(qty / daysInRange),
        allocationPct: regionTotalDemand > 0 ? Math.min(1, qty / regionTotalDemand) : null,
      }
    })
    facilityAllocation = sortByLocationOrder(facilityAllocation, l => l.location)

    // ── Category / Sub-category sales ──────────────────────────────────────────
    const catMap = new Map()
    const subCatMap = new Map()
    const skuSalesMap = new Map()
    const skuVariantMap = new Map() // skuKey -> Map(rawFinalSku -> {sku, qty, rev})
    for (const r of rangeRows) {
      const { key, finalSku } = resolveMasterSkuKey(r.final_sku, skuMap)
      const master = itemMaster.get(key)
      const catCategory = master?.category || 'Uncategorized'
      const subCategory_ = master?.subCategory || 'Uncategorized'
      const catKey = catCategory
      if (!catMap.has(catKey)) catMap.set(catKey, { category: catCategory, qty: 0, rev: 0 })
      const c = catMap.get(catKey)
      c.qty += Number(r.qty || 0)
      c.rev += num(r.rev)

      const subKey = `${catCategory}|${subCategory_}`
      if (!subCatMap.has(subKey)) subCatMap.set(subKey, { category: catCategory, subCategory: subCategory_, qty: 0, rev: 0 })
      const sc = subCatMap.get(subKey)
      sc.qty += Number(r.qty || 0)
      sc.rev += num(r.rev)

      if (!skuSalesMap.has(key)) skuSalesMap.set(key, { sku: finalSku, skuKey: key, category: catCategory, subCategory: subCategory_, qty: 0, rev: 0 })
      const s = skuSalesMap.get(key)
      s.qty += Number(r.qty || 0)
      s.rev += num(r.rev)

      // Raw (pre-master-SKU-mapping) code — lets the UI expand a master SKU into the
      // individual duplicate/alias/variant codes that roll up into it.
      const rawCode = String(r.final_sku || '').trim()
      if (!skuVariantMap.has(key)) skuVariantMap.set(key, new Map())
      const variants = skuVariantMap.get(key)
      if (!variants.has(rawCode)) variants.set(rawCode, { sku: rawCode, qty: 0, rev: 0 })
      const v = variants.get(rawCode)
      v.qty += Number(r.qty || 0)
      v.rev += num(r.rev)
    }
    const categorySales = [...catMap.values()].sort((a, b) => b.rev - a.rev)
    const subCategorySales = [...subCatMap.values()].sort((a, b) => b.rev - a.rev)

    // Sparkline: last 14 days of qty (from the full daily series, zero-filled) per top-mover SKU.
    const sparkDates = daily.slice(-14).map(d => d.date)
    function sparklineFor(skuKey) {
      const perDate = skuDailyMap.get(skuKey)
      return sparkDates.map(d => perDate?.get(d) || 0)
    }

    // ── Top / bottom movers (Top N, configurable — roadmap 2.4) ─────────────────
    // `variants` lets the UI expand a master SKU row into the raw duplicate/alias codes
    // that roll up into it (e.g. a stand-in code used at inward time for the same product).
    function variantsFor(skuKey) {
      const m = skuVariantMap.get(skuKey)
      if (!m) return []
      return [...m.values()].sort((a, b) => b.qty - a.qty)
    }
    const skuSalesArr = [...skuSalesMap.values()]
    const topMoversByQty = [...skuSalesArr].sort((a, b) => b.qty - a.qty).slice(0, topNVal)
      .map(s => ({ ...s, sparkline: sparklineFor(s.skuKey), variants: variantsFor(s.skuKey) }))
    const topMoversByRevenue = [...skuSalesArr].sort((a, b) => b.rev - a.rev).slice(0, topNVal)
      .map(s => ({ ...s, sparkline: sparklineFor(s.skuKey), variants: variantsFor(s.skuKey) }))
    const deadStock = [...invBySku.entries()]
      .filter(([, invt]) => invt > 0)
      .map(([key, invt]) => ({ skuKey: key, sku: skuSalesMap.get(key)?.sku || key, totalInvt: Math.round(invt), qtySold: skuSalesMap.get(key)?.qty || 0 }))
      .filter(s => s.qtySold === 0)
      .sort((a, b) => b.totalInvt - a.totalInvt)
      .slice(0, 10)

    // ── KPIs (+ period-over-period deltas when requested) ─────────────────────
    const totalUnits = daily.reduce((s, d) => s + d.qty, 0)
    const totalRevenue = daily.reduce((s, d) => s + d.rev, 0)
    const avgSellingPrice = totalUnits > 0 ? totalRevenue / totalUnits : 0
    const totalDemand = [...regionDemand.values()].reduce((s, v) => s + v, 0)
    const totalAlloc = [...regionAlloc.values()].reduce((s, v) => s + v, 0)
    const fillRate = totalDemand > 0 ? Math.min(1, totalAlloc / totalDemand) : null

    const firstDay = daily[0]?.qty || 0
    const lastDay = daily[daily.length - 1]?.qty || 0
    const momentumPct = firstDay > 0 ? ((lastDay - firstDay) / firstDay) * 100 : null

    let previousPeriod = null
    if (comparePrevious && prevResult) {
      const [prevRows] = prevResult
      const prevUnits = Number(prevRows[0]?.qty || 0)
      const prevRevenue = num(prevRows[0]?.rev)
      previousPeriod = {
        range: { start: prevStartStr, end: prevEndStr },
        totalUnits: Math.round(prevUnits),
        totalRevenue: Math.round(prevRevenue),
        unitsChangePct: prevUnits > 0 ? ((totalUnits - prevUnits) / prevUnits) * 100 : null,
        revenueChangePct: prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null,
      }
    }

    // ── Filter option lists (from static reference data, unaffected by active filters) ──
    const liveFacilities = [...facilityToStatus.entries()].filter(([, status]) => status === 'Live').map(([f]) => f)
    const filterOptions = {
      categories: [...new Set([...itemMaster.values()].map(m => m.category))].sort(),
      subCategories: [...new Set([...itemMaster.values()].map(m => m.subCategory))].sort(),
      channels: [...new Set([...channelToUnified.values()].map(c => norm(c)))].sort(),
      channelTypes: [...new Set([...channelToDescription.values()].filter(Boolean))].sort(),
      regions: [...new Set([...stateToRegion.values()])].sort(),
      facilities: liveFacilities.map(f => ({ facility: f, displayName: facilityToDisplayName.get(f) || f })).sort((a, b) => a.facility.localeCompare(b.facility)),
      skus: [...skuSalesMap.values()].map(s => s.sku).sort(),
    }

    res.json({
      dateRange: { start, end, days: daysInRange },
      lastSalesDate: maxSalesDate,
      lastSalesDateConsidered,
      momentumWindow: N,
      topN: topNVal,
      filterOptions,
      summary: {
        totalUnits: Math.round(totalUnits),
        totalRevenue: Math.round(totalRevenue),
        avgSellingPrice: Math.round(avgSellingPrice),
        fillRate,
        momentumPct,
      },
      previousPeriod,
      daily,
      weekly,
      monthly,
      momentum,
      channelMatrix,
      topChannels,
      channelSales,
      channelTypeSales,
      channelTrend,
      topChannelNames,
      regionComparison,
      facilityAllocation,
      categorySales,
      subCategorySales,
      topMoversByQty,
      topMoversByRevenue,
      deadStock,
    })
  } catch (e) {
    console.error('[sales-allocation]', e.message)
    res.status(500).json({ error: e.message })
  }
}
