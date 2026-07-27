import { getBQ } from './_bq.js'
import {
  buildFacilityMaps, norm, normSku, cleanLabel,
  parsePackQty, isRawSkuText, isPseudoSku, computeRowInventory,
  buildSkuMap, resolveMasterSkuKey, sortByLocationOrder,
  isB2CChannel, isTotalAvgSaleChannel, stockStatus,
} from './_inventory_shared.js'

// Avg Sale for the inward-vs-demand comparison uses a fixed trailing 7-day window,
// anchored to the latest date that actually has sales data (excluding it as possibly
// partial) — same rule as Inventory Health's Avg Sale, kept independent of the GRN
// date range since "how fast is this selling right now" shouldn't shift with whatever
// inward period is being viewed.
const AVG_SALE_WINDOW_DAYS = 7

function matchesMulti(value, filterCsv) {
  if (!filterCsv) return true
  const vals = filterCsv.split(',').map(v => v.trim()).filter(Boolean)
  return vals.length === 0 || vals.includes(value)
}
function splitCsv(v) {
  return v ? v.split(',').map(x => x.trim()).filter(Boolean) : null
}
function weekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}
function monthKey(dateStr) { return dateStr.slice(0, 7) }

export default async function inwardHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { start, end, category, subCategory, facility, vendor, sku, includeUnmapped } = req.body
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end date' })

  try {
    const bq = getBQ()
    const { facilityToLocation, facilityToStatus, channelToDescription } = buildFacilityMaps()
    const daysInRange = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1)

    // Sales/inventory freshness (Avg Sale, DOI) is anchored to "now" (today), not the GRN
    // date range — "how fast is this SKU selling right now" and "how much stock exists
    // right now" are both present-tense questions regardless of which past inward period
    // is being viewed. "Total Sold Qty" (the inward-vs-demand KPI below) is different — it
    // deliberately uses the SAME start/end as the GRN filter. One sales query covers both:
    // fetch the union of the trailing Avg Sale window and the GRN period.
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const avgSaleFetchStart = new Date(today); avgSaleFetchStart.setDate(avgSaleFetchStart.getDate() - (AVG_SALE_WINDOW_DAYS + 5))
    const salesFetchStartStr = avgSaleFetchStart < new Date(start) ? avgSaleFetchStart.toISOString().slice(0, 10) : start
    const salesFetchEndStr = todayStr > end ? todayStr : end

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
                WHERE DATE(\`GRN Date\`) BETWEEN '${start}' AND '${end}'`,
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
      // Current total inventory per SKU — dedupe to latest per (ItemSkuCode, Facility),
      // same logic as api/inventory.js.
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
      // Covers both the trailing Avg Sale window (for DOI) and the GRN period (for the
      // Total Sold Qty / Inward Coverage Ratio KPIs) in one fetch.
      bq.query({
        query: `SELECT final_sku, state, channel, order_date, SUM(total_quantity) AS qty
                FROM \`frido-429506.production.Aggregated_uniware_sales_report\`
                WHERE order_date BETWEEN '${salesFetchStartStr}' AND '${salesFetchEndStr}'
                GROUP BY final_sku, state, channel, order_date`,
        maximumBytesBilled: '5000000000',
      }),
    ])

    const skuMap = buildSkuMap(skuMappingRows)

    // Coupon/gift-card/service codes (COUP*, *DFA*) are not physical stock — excluded from
    // every sales-derived number below (Avg Sale, Total Sold Qty, per-SKU Sold Qty).
    const cleanSalesRows = salesRows.filter(row => !isPseudoSku(row.final_sku))

    // ── Item master lookup, keyed by normalized SKU ──────────────────────────
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

    // ── Current total inventory per SKU — "how much stock exists right now" ──────────
    const invBySku = new Map()
    for (const row of invRows) {
      if (isPseudoSku(row.ItemSkuCode)) continue
      if (facilityToStatus.get(row.Facility) !== 'Live') continue
      const { key } = resolveMasterSkuKey(row.ItemSkuCode, skuMap)
      if (!key) continue
      const { totalInventory } = computeRowInventory(row)
      invBySku.set(key, (invBySku.get(key) || 0) + totalInventory)
    }

    // ── Trailing Avg Sale (B2C, anchored to latest available sales date) per SKU ──────
    // Same anchoring rule as Inventory Health: exclude the latest date present (it may be
    // a partial day) and average over the AVG_SALE_WINDOW_DAYS full days before it.
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

    // ── Total Sold Qty for the SAME start/end as the GRN filter — the "did what came in
    // this period cover what sold this period" comparison. B2C+B2B+Purchase Order, same
    // channel scope as the "Total Avg Sale" KPI elsewhere, restricted to finished-goods
    // SKUs (a real item-master match) so it's comparable to the inward total below. ──
    let totalSoldQty = 0
    for (const row of cleanSalesRows) {
      const d = row.order_date?.value || row.order_date
      if (!d || d < start || d > end) continue
      if (!isTotalAvgSaleChannel(row.channel, channelToDescription)) continue
      const { key } = resolveMasterSkuKey(row.final_sku, skuMap)
      if (!key || !itemMaster.has(key)) continue
      totalSoldQty += Number(row.qty || 0)
    }

    // ── Resolve each GRN line to a master SKU + pack-qty-scaled received/rejected qty ──
    // Mirrors computeRowInventory's raw-material handling in _inventory_shared.js: a SKU
    // code like "FR-XYZ_RAW_PO25" is raw material received in packs of 25 — the true unit
    // count is Quantity Received × packQty, not the raw GRN line quantity.
    const rows = []
    for (const r of grnRows) {
      if (isPseudoSku(r.itemSkuCode)) continue
      const facilityStatus = facilityToStatus.get(r.Facility)
      if (facilityStatus !== 'Live') continue
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
      const leadTimeHours = receivedTs && qcTs
        ? (new Date(qcTs) - new Date(receivedTs)) / 3600000
        : null

      // GRN lines with no item-master match are real inward activity (packaging, raw
      // material, or SKUs simply missing from the master) — kept as a normal "Unmapped"
      // category/sub-category rather than dropped, so nothing is silently excluded. The
      // category filter defaults to hiding "Unmapped" (see filterOptions.categories /
      // defaultCategoryExclusions below) but it stays fully visible and countable when a
      // user explicitly selects it.
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

    // ── Apply filters ────────────────────────────────────────────────────────
    // "Unmapped" is excluded from category results unless the caller explicitly asks for
    // it — either by name in the `category` filter, or via includeUnmapped=true (used by
    // the sidebar's "show unmapped" toggle, which lists it outside the normal multiselect).
    const facilityFilterVals = splitCsv(facility)
    const categoryFilterVals = splitCsv(category)
    const wantsUnmapped = includeUnmapped === true || includeUnmapped === 'true' || (categoryFilterVals && categoryFilterVals.includes('Unmapped'))
    const filtered = rows.filter(r => {
      if (r.category === 'Unmapped' && !wantsUnmapped) return false
      if (category && !matchesMulti(r.category, category)) return false
      if (subCategory && !matchesMulti(r.subCategory, subCategory)) return false
      if (facilityFilterVals && !facilityFilterVals.includes(r.facility)) return false
      if (vendor && !matchesMulti(r.vendorName, vendor)) return false
      if (sku && !matchesMulti(r.sku, sku)) return false
      return true
    })

    // Everything downstream (KPIs, trend, breakdowns, SKU table) runs over one consistent
    // row set — "Unmapped" behaves like any other category rather than a separate stream.
    const finishedGoods = filtered

    // ── Per-SKU Sold Qty for the SAME start/end as the GRN filter — one entry per SKU so
    // it can sit next to Received in the SKU table (see soldQtyBySku below). ──
    const soldQtyBySku = new Map()
    for (const row of cleanSalesRows) {
      const d = row.order_date?.value || row.order_date
      if (!d || d < start || d > end) continue
      if (!isTotalAvgSaleChannel(row.channel, channelToDescription)) continue
      const { key } = resolveMasterSkuKey(row.final_sku, skuMap)
      if (!key) continue
      soldQtyBySku.set(key, (soldQtyBySku.get(key) || 0) + Number(row.qty || 0))
    }

    // ── SKU-level inward table — the detailed line-item view, one row per SKU (for this
    // filtered period), with current inventory + trailing Avg Sale/DOI attached so it
    // reads as "is what's coming in matched by what's actually selling," not just a raw
    // received-quantity count. ──
    const skuMap2 = new Map()
    for (const r of finishedGoods) {
      if (!skuMap2.has(r.skuKey)) {
        skuMap2.set(r.skuKey, {
          sku: r.sku, category: r.category, subCategory: r.subCategory,
          qtyReceived: 0, qtyRejected: 0,
        })
      }
      const s = skuMap2.get(r.skuKey)
      s.qtyReceived += r.qtyReceived
      s.qtyRejected += r.qtyRejected
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

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const totalReceived = finishedGoods.reduce((s, r) => s + r.qtyReceived, 0)
    const totalRejected = finishedGoods.reduce((s, r) => s + r.qtyRejected, 0)
    const rejectionPct = (totalReceived + totalRejected) > 0 ? (totalRejected / (totalReceived + totalRejected)) * 100 : 0
    const distinctGrns = new Set(finishedGoods.map(r => r.grnCode)).size
    const distinctPOs = new Set(finishedGoods.map(r => r.poCode).filter(Boolean)).size
    const leadTimes = finishedGoods.map(r => r.leadTimeHours).filter(v => v != null && v >= 0)
    const avgLeadTimeHours = leadTimes.length > 0 ? leadTimes.reduce((s, v) => s + v, 0) / leadTimes.length : null
    const distinctVendors = new Set(finishedGoods.map(r => r.vendorName)).size
    const distinctSkus = new Set(finishedGoods.map(r => r.skuKey)).size
    // Inward Coverage Ratio = units received ÷ units sold, same period — >1 means more
    // came in than went out (building up stock), <1 means selling faster than restocking.
    const inwardCoverageRatio = totalSoldQty > 0 ? totalReceived / totalSoldQty : null

    // ── Daily/weekly/monthly trend ───────────────────────────────────────────
    const dailyMap = new Map()
    for (const r of finishedGoods) {
      if (!r.date) continue
      if (!dailyMap.has(r.date)) dailyMap.set(r.date, { date: r.date, qtyReceived: 0, qtyRejected: 0 })
      const d = dailyMap.get(r.date)
      d.qtyReceived += r.qtyReceived
      d.qtyRejected += r.qtyRejected
    }
    const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))
    function rollup(keyFn) {
      const m = new Map()
      for (const d of daily) {
        const k = keyFn(d.date)
        if (!m.has(k)) m.set(k, { date: k, qtyReceived: 0, qtyRejected: 0 })
        const acc = m.get(k)
        acc.qtyReceived += d.qtyReceived
        acc.qtyRejected += d.qtyRejected
      }
      return [...m.values()].sort((a, b) => a.date.localeCompare(b.date))
    }
    const weekly = rollup(weekKey)
    const monthly = rollup(monthKey)

    // ── Category / Sub-category breakdown ───────────────────────────────────
    const catMap = new Map()
    const subCatMap = new Map()
    for (const r of finishedGoods) {
      if (!catMap.has(r.category)) catMap.set(r.category, { category: r.category, qtyReceived: 0, qtyRejected: 0 })
      const c = catMap.get(r.category)
      c.qtyReceived += r.qtyReceived
      c.qtyRejected += r.qtyRejected

      const subKey = `${r.category}|${r.subCategory}`
      if (!subCatMap.has(subKey)) subCatMap.set(subKey, { category: r.category, subCategory: r.subCategory, qtyReceived: 0, qtyRejected: 0 })
      const sc = subCatMap.get(subKey)
      sc.qtyReceived += r.qtyReceived
      sc.qtyRejected += r.qtyRejected
    }
    const categoryBreakdown = [...catMap.values()].sort((a, b) => b.qtyReceived - a.qtyReceived)
    const subCategoryBreakdown = [...subCatMap.values()].sort((a, b) => b.qtyReceived - a.qtyReceived)

    // ── Vendor performance ───────────────────────────────────────────────────
    const vendorMap = new Map()
    for (const r of finishedGoods) {
      if (!vendorMap.has(r.vendorName)) vendorMap.set(r.vendorName, { vendor: r.vendorName, qtyReceived: 0, qtyRejected: 0, grns: new Set() })
      const v = vendorMap.get(r.vendorName)
      v.qtyReceived += r.qtyReceived
      v.qtyRejected += r.qtyRejected
      v.grns.add(r.grnCode)
    }
    const vendorPerformance = [...vendorMap.values()].map(v => ({
      vendor: v.vendor, qtyReceived: v.qtyReceived, qtyRejected: v.qtyRejected,
      rejectionPct: (v.qtyReceived + v.qtyRejected) > 0 ? (v.qtyRejected / (v.qtyReceived + v.qtyRejected)) * 100 : 0,
      grnCount: v.grns.size,
    })).sort((a, b) => b.qtyReceived - a.qtyReceived)

    // ── Facility-wise inward (location-ordered) ─────────────────────────────
    const facilityMap = new Map()
    for (const r of finishedGoods) {
      if (!facilityMap.has(r.location)) facilityMap.set(r.location, { location: r.location, qtyReceived: 0, qtyRejected: 0 })
      const f = facilityMap.get(r.location)
      f.qtyReceived += r.qtyReceived
      f.qtyRejected += r.qtyRejected
    }
    const facilityBreakdown = sortByLocationOrder([...facilityMap.values()].filter(f => f.location !== 'Unmapped'), f => f.location)

    // ── Rejection reasons ─────────────────────────────────────────────────────
    const reasonMap = new Map()
    for (const r of finishedGoods) {
      if (!r.rejectionReason || r.qtyRejected <= 0) continue
      const reason = r.rejectionReason
      reasonMap.set(reason, (reasonMap.get(reason) || 0) + r.qtyRejected)
    }
    const rejectionReasons = [...reasonMap.entries()].map(([reason, qty]) => ({ reason, qty })).sort((a, b) => b.qty - a.qty)

    // ── Filter option lists ───────────────────────────────────────────────────
    // Categories are listed from the FULL row set (before the "hide Unmapped by default"
    // filter above) so "Unmapped" always appears as a selectable option — otherwise a
    // default-excluded category could never be discovered/selected in the first place.
    const liveFacilities = [...facilityToStatus.entries()].filter(([, status]) => status === 'Live').map(([f]) => f)
    const filterOptions = {
      categories: [...new Set(rows.map(r => r.category))].sort((a, b) => (a === 'Unmapped') - (b === 'Unmapped') || a.localeCompare(b)),
      subCategories: [...new Set(finishedGoods.map(r => r.subCategory))].sort(),
      facilities: liveFacilities.filter(f => finishedGoods.some(r => r.facility === f)).sort(),
      vendors: [...new Set(finishedGoods.map(r => r.vendorName))].sort(),
      skus: [...new Set(finishedGoods.map(r => r.sku))].sort(),
    }

    res.json({
      dateRange: { start, end, days: daysInRange },
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
    })
  } catch (e) {
    console.error('[inward]', e.message)
    res.status(500).json({ error: e.message })
  }
}
