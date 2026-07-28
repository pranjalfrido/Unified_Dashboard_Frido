import { getBQ } from './_bq.js'
import { buildFacilityMaps, norm, normSku, cleanLabel, computeRowInventory, isPseudoSku, buildSkuMap, resolveMasterSkuKey, sortByLocationOrder, salesTypeFor } from './_inventory_shared.js'

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

// Weekly/monthly/quarterly/yearly bucket keys — ISO week (Mon start), calendar month,
// calendar quarter, calendar year.
function weekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = (d.getUTCDay() + 6) % 7 // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}
function monthKey(dateStr) { return dateStr.slice(0, 7) }
function quarterKey(dateStr) {
  const [y, m] = dateStr.split('-')
  return `${y}-Q${Math.ceil(Number(m) / 3)}`
}
function yearKey(dateStr) { return dateStr.slice(0, 4) }

export default async function salesAllocationHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    start, end, category, subCategory, sku, channel: channelFilter, salesType, facility, region: regionFilter,
    comparePrevious, momentumWindow, topN, matrixChannel, drasticChannel,
  } = req.body
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end date' })
  const topNVal = Math.max(1, Math.min(50, parseInt(topN, 10) || 10))

  try {
    const bq = getBQ()
    const { facilityToLocation, facilityToDisplayName, facilityToStatus, stateToRegion, stateToNearestWH, locationToRegion, channelToUnified, channelToUnified2, channelToDescription } = buildFacilityMaps()
    const daysInRange = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)
    const N = Math.max(1, Math.min(90, parseInt(momentumWindow, 10) || 7))

    // Previous period: same length, immediately preceding the selected range.
    const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1)
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - daysInRange + 1)
    const prevStartStr = prevStart.toISOString().slice(0, 10), prevEndStr = prevEnd.toISOString().slice(0, 10)

    // Widen the raw pull to cover whichever momentum window is requested (so "last day vs
    // Nth-last day" always has data even when N exceeds the selected range) and the Top
    // Movers section's fixed 2-day/7-day comparison modes (independent of momentumWindow —
    // needs at least 8 distinct days ending at `end` for the 7-day mode).
    const momentumLookback = new Date(start); momentumLookback.setDate(momentumLookback.getDate() - N)
    const moversLookback = new Date(end); moversLookback.setDate(moversLookback.getDate() - 7)
    let fetchStartStr = start
    if (momentumLookback < new Date(fetchStartStr)) fetchStartStr = momentumLookback.toISOString().slice(0, 10)
    if (moversLookback < new Date(fetchStartStr)) fetchStartStr = moversLookback.toISOString().slice(0, 10)

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
      if (isPseudoSku(row.final_sku)) continue
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
    // Sales Type = B2C Order / B2B Order / Purchase Order, from channel_description.
    // A channel unmapped in the reference sheet defaults to B2C (see salesTypeFor) — real
    // marketplace/D2C channels that just haven't been added to the mapping sheet yet.
    // Channels explicitly mapped to Stock transfer/Ignore/Custom are NOT sales at all —
    // excluded unconditionally, regardless of the salesType filter's value.
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
      const type = salesTypeFor(r.channel, channelToDescription)
      if (!type) return false
      if (salesType && !matchesMulti(type, salesType)) return false
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

    // ── Top Movers (drastic sales change) — SKU / Sub-category / Category, 3 comparison
    // modes, top 20 risers + top 20 fallers each. Separate from the Momentum block above
    // (which is SKU-only, top 10, fixed windows) — this is the general-purpose "what changed
    // the most" explorer with a level toggle and a comparison-mode toggle. Own "Channel"
    // filter (drasticChannel, unified_channel2-based like the matrix's), independent of the
    // sidebar's channel slicer — applied only within this section.
    const drasticRows_ = drasticChannel
      ? lookbackRows.filter(r => matchesMulti(channelToUnified2.get(norm(r.channel)) || 'Purchase Order', drasticChannel))
      : lookbackRows
    function buildDailyMap(keyFn) {
      const m = new Map() // groupKey -> Map(date -> {qty, rev})
      for (const r of drasticRows_) {
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
      subCategory: groupKey => {
        const [cat, sub] = groupKey.split('|')
        return { subCategory: sub, category: cat }
      },
      category: groupKey => ({ category: groupKey }),
    }

    // Comparison-date resolver — anchored to the selected range's `end` date ("last day"
    // always means the last day of the range the user picked, not whatever happens to be
    // the latest date in the widened lookback fetch). "Nth-last day" counts inclusively
    // from `end` (end itself = 1st-last day), so the gap in days is N-1: 2nd-last day is 1
    // day before end, 7th-last day is 6 days before.
    function resolveCompareDates(mode) {
      const windowN = mode === 'day2' ? 1 : 6
      const compareD = new Date(end); compareD.setDate(compareD.getDate() - windowN)
      const compareDate = compareD.toISOString().slice(0, 10)
      if (!lookbackDates.includes(end) && !lookbackDates.includes(compareDate)) return null
      return { lastDate: end, compareDate }
    }

    function topMoversFor(level, mode, metric) {
      const dates = resolveCompareDates(mode)
      if (!dates) return { risers: [], fallers: [], lastDate: null, compareDate: null }
      const { lastDate, compareDate } = dates
      const dailyMap = moversDailyByLevel[level]
      const labelFor = moversLabelForLevel[level]
      const rows = []
      for (const [groupKey, perDate] of dailyMap) {
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
    // Precompute all 3 levels x 3 modes x 2 metrics (18 combos) — cheap given the daily
    // maps are already built once above; lets the frontend toggle instantly with no refetch.
    const topMovers = {}
    for (const level of ['sku', 'subCategory', 'category']) {
      topMovers[level] = {}
      for (const mode of ['day2', 'day7']) {
        topMovers[level][mode] = {
          qty: topMoversFor(level, mode, 'qty'),
          rev: topMoversFor(level, mode, 'rev'),
        }
      }
    }

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
      for (const ch of topChannelNames) {
        const v = channelTrendMap.get(`${date}|${ch}`)
        point[ch] = v ? v.qty : 0
      }
      return point
    })

    // ── Region demand vs allocation, and Fill Rate % ──────────────────────────
    // Region-level Fill Rate = allocation landed in the region-correct facility ÷ total
    // demand for that region. No order-level id exists in this pre-aggregated table, so
    // quantity is used as the unit of measure throughout (consistent with how
    // Order_Allocation was defined in the original model).
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

    // ── Exact Fill Rate (state → nearest_wh sheet) ──────────────────────────────
    // Per-warehouse: demand = units from states whose designated nearest_wh IS this WH;
    // correctlyAllocated = of that demand, how many units actually shipped FROM this WH
    // (as opposed to being shipped from a different WH instead). E.g. for GGN: demand is
    // the total units ordered by UP/Delhi/Haryana/Punjab/etc (states routed to GGN); the
    // fill rate is what fraction of that demand actually shipped out of GGN specifically.
    // Rows with an unmapped state or unmapped facility are excluded — we can't judge
    // correctness without a designated nearest WH to compare against.
    const whDemand = new Map()    // nearestWH -> total qty demanded by states routed to it
    const whCorrect = new Map()   // nearestWH -> qty of that demand actually shipped from it
    let exactCorrectQty = 0, exactTotalQty = 0
    for (const r of rangeRows) {
      const nearestWH = stateToNearestWH.get(norm(r.state))
      const location = facilityToLocation.get(r.Facility)
      if (!nearestWH || !location) continue
      const qty = Number(r.qty || 0)
      exactTotalQty += qty
      whDemand.set(nearestWH, (whDemand.get(nearestWH) || 0) + qty)
      if (location === nearestWH) {
        exactCorrectQty += qty
        whCorrect.set(nearestWH, (whCorrect.get(nearestWH) || 0) + qty)
      }
    }
    const exactFillRate = exactTotalQty > 0 ? exactCorrectQty / exactTotalQty : null
    const fillRateByWarehouse = sortByLocationOrder([...whDemand.entries()].map(([wh, demand]) => {
      const correct = whCorrect.get(wh) || 0
      return {
        warehouse: wh,
        demandQty: Math.round(demand),
        demandQtyPerDay: Math.round(demand / daysInRange),
        correctQty: Math.round(correct),
        correctQtyPerDay: Math.round(correct / daysInRange),
        fillRate: demand > 0 ? correct / demand : null,
      }
    }), r => r.warehouse)

    // ── Facility-location allocation % (roadmap 2.6) ────────────────────────────
    // Allocation % = orders landed at a facility's location ÷ total orders originating from
    // that location's mapped region — i.e. how much of a region's demand a given WH is absorbing.
    const facilityQty = new Map() // location -> qty allocated there
    const facilityRev = new Map() // location -> revenue allocated there
    const facilitySkus = new Map() // location -> Set(skuKey) — assortment breadth
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
        location,
        region: region || null,
        qty: Math.round(qty),
        qtyPerDay: Math.round(qty / daysInRange),
        rev: Math.round(rev),
        revPerDay: Math.round(rev / daysInRange),
        asp: qty > 0 ? Math.round(rev / qty) : null,
        sharePct: totalAllocQty > 0 ? qty / totalAllocQty : null,
        skuCount: facilitySkus.get(location)?.size || 0,
        allocationPct: regionTotalDemand > 0 ? Math.min(1, qty / regionTotalDemand) : null,
      }
    })
    facilityAllocation = sortByLocationOrder(facilityAllocation, l => l.location)
    const facilityAllocationByRevenue = [...facilityAllocation].sort((a, b) => b.rev - a.rev)

    // ── Category / Sub-category sales ──────────────────────────────────────────
    const catMap = new Map()
    const subCatMap = new Map()
    const skuSalesMap = new Map()
    const skuVariantMap = new Map() // skuKey -> Map(rawFinalSku -> {sku, qty, rev})
    for (const r of rangeRows) {
      const { key, finalSku } = resolveMasterSkuKey(r.final_sku, skuMap)
      const master = itemMaster.get(key)
      if (!master) continue
      const catCategory = master.category
      const subCategory_ = master.subCategory
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

    // ── Channel-wise sales, unified_channel2 grouping ───────────────────────────
    // Coarser than channelSales (unified_channel) — e.g. all Amazon sub-channels roll into
    // "Amazon", B2B into "B2B", long-tail marketplaces into "Others". rangeRows is already
    // restricted to B2C/B2B/Purchase Order by passesFilters (salesTypeFor). A real gap in
    // the reference sheet: several genuine Purchase Order channels (FBA, FBF, ZEPTO, EXPORT,
    // BLINKIT_FRIDO, retailEZ, Scapia) have no unified_channel2 value at all, and were
    // previously dropped from this chart entirely as a result. Every channel that's unmapped
    // in unified_channel2 AND still reaches this loop is, by construction, Purchase Order —
    // Stock transfer/Ignore/Custom channels never make it into rangeRows (excluded earlier by
    // salesTypeFor) — so route them into their own "Purchase Order" bucket, not "Others".
    const channel2Map = new Map()
    for (const r of rangeRows) {
      const unified2 = channelToUnified2.get(norm(r.channel)) || 'Purchase Order'
      if (!channel2Map.has(unified2)) channel2Map.set(unified2, { channel: unified2, qty: 0, rev: 0 })
      const c2 = channel2Map.get(unified2)
      c2.qty += Number(r.qty || 0)
      c2.rev += num(r.rev)
    }
    const channelSales2 = [...channel2Map.values()].sort((a, b) => b.rev - a.rev)

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
    // Full, untruncated per-product sales table for the selected date range — every SKU
    // that sold at least one unit, sorted by revenue. Distinct from topMoversByQty/Revenue
    // above, which are capped at topNVal for the sparkline-driven Top Movers card.
    const productSales = [...skuSalesArr]
      .map(s => ({ sku: s.sku, category: s.category, subCategory: s.subCategory, qty: s.qty, rev: Math.round(s.rev), asp: s.qty > 0 ? Math.round(s.rev / s.qty) : null }))
      .sort((a, b) => b.rev - a.rev)

    // ── Product-Wise Sales Matrix — Category → Sub-category → SKU rows, day-granularity
    // cells only (week/month/quarter/year are re-bucketed client-side from these same daily
    // cells via weekKey/monthKey/etc. equivalents — computing all 5 granularities server-
    // side made the payload balloon ~5x for no benefit, since the frontend only renders one
    // granularity at a time anyway). Own "Channel" filter (matrixChannel), independent of
    // the sidebar's channel slicer, applied only within this matrix — the rest of the page
    // keeps whatever the sidebar has selected.
    const matrixRows = matrixChannel
      ? rangeRows.filter(r => matchesMulti(channelToUnified2.get(norm(r.channel)) || 'Purchase Order', matrixChannel))
      : rangeRows
    // Category/sub-category names can legitimately contain "|" (seen in real data, e.g.
    // "FSS101 | Everyday Foldable Wheelchair"), which broke naive |-delimited keys — a
    // sub-category's own pipe shifted every field during decode, corrupting `date` and
    // crashing the frontend's date parsing. \x1F (ASCII Unit Separator) can't appear in
    // real product text, so it's used as the field delimiter instead.
    const MSEP = '\x1f'
    const matrixCells = new Map() // `${category}${MSEP}${subCategory}${MSEP}${skuKey}${MSEP}${date}` -> {qty, rev}
    const matrixDatesSet = new Set()
    function addCell(catKey, subKey, skuKeyPath, date, qty, rev) {
      const cellKey = `${catKey}${MSEP}${subKey}${MSEP}${skuKeyPath}${MSEP}${date}`
      if (!matrixCells.has(cellKey)) matrixCells.set(cellKey, { qty: 0, rev: 0 })
      const c = matrixCells.get(cellKey)
      c.qty += qty
      c.rev += rev
    }
    const matrixSkuMeta = new Map() // skuKey -> { sku, category, subCategory }
    for (const r of matrixRows) {
      const date = r.order_date?.value || r.order_date
      if (!date) continue
      const { key, finalSku } = resolveMasterSkuKey(r.final_sku, skuMap)
      const master = itemMaster.get(key)
      if (!master) continue
      const cat = master.category
      const sub = master.subCategory
      const qty = Number(r.qty || 0)
      const rev = num(r.rev)
      matrixDatesSet.add(date)
      if (!matrixSkuMeta.has(key)) matrixSkuMeta.set(key, { sku: finalSku, category: cat, subCategory: sub })

      addCell(cat, '', '', date, qty, rev)   // category-level rollup
      addCell(cat, sub, '', date, qty, rev)   // sub-category-level rollup
      addCell(cat, sub, key, date, qty, rev)  // sku-level
    }
    // Emit as plain arrays — Maps don't serialize over JSON. Cells keyed by a "category<SEP
    // >sub<SEP>sku" path (sku empty = sub-category row; sub empty = category row) so the
    // frontend can look up any row's cells by the same path regardless of expand state.
    const matrixCellRows = [...matrixCells.entries()].map(([k, v]) => {
      const [cat, sub, skuKeyPath, date] = k.split(MSEP)
      return { path: `${cat}${MSEP}${sub}${MSEP}${skuKeyPath}`, date, qty: Math.round(v.qty), rev: Math.round(v.rev) }
    })
    const matrixSkuList = [...matrixSkuMeta.entries()].map(([key, meta]) => ({ skuKey: key, ...meta }))
    const matrixDates = [...matrixDatesSet].sort()
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
    const avgDailyRevenue = totalRevenue / daysInRange
    const avgDailyUnits = totalUnits / daysInRange
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
      // Same "unmapped -> Purchase Order" fallback as channelSales2 below, so the matrix's
      // own channel slicer offers exactly the buckets that chart actually produces.
      unifiedChannels2: [...new Set([...channelToUnified2.values()].filter(Boolean).concat('Purchase Order'))].sort(),
      salesTypes: ['B2C Order', 'B2B Order', 'Purchase Order'],
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
        avgDailyRevenue: Math.round(avgDailyRevenue),
        avgDailyUnits: Math.round(avgDailyUnits),
        avgSellingPrice: Math.round(avgSellingPrice),
        fillRate,
        exactFillRate,
        momentumPct,
      },
      previousPeriod,
      daily,
      weekly,
      monthly,
      momentum,
      topMovers,
      channelMatrix,
      topChannels,
      channelSales,
      channelSales2,
      channelTypeSales,
      channelTrend,
      topChannelNames,
      regionComparison,
      facilityAllocation,
      facilityAllocationByRevenue,
      fillRateByWarehouse,
      categorySales,
      subCategorySales,
      productSales,
      matrixCellRows,
      matrixSkuList,
      matrixDates,
      topMoversByQty,
      topMoversByRevenue,
      deadStock,
    })
  } catch (e) {
    console.error('[sales-allocation]', e.message)
    res.status(500).json({ error: e.message })
  }
}
