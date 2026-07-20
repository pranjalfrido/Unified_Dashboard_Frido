import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')

// Fixed display order for warehouse locations — used everywhere a location list is
// rendered (Warehouse Health cards, sidebar tiles, pivot table columns, per-SKU location
// rows, facility allocation list) so the same location always sits in the same spot
// regardless of which metric that view happens to sort by.
export const LOCATION_ORDER = ['PNQ', 'GGN', 'BLR', 'MUM', 'KOL', 'HYD', 'CHN']
export function sortByLocationOrder(items, getLocation = x => x) {
  return [...items].sort((a, b) => {
    const ia = LOCATION_ORDER.indexOf(getLocation(a))
    const ib = LOCATION_ORDER.indexOf(getLocation(b))
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
}

// ── Reference lookups (SharePoint Excel exports, pending GCP sync) ──────────
let _facilityRows, _channelRows, _regionRows
export function loadRefData() {
  if (!_facilityRows) _facilityRows = JSON.parse(readFileSync(join(DATA_DIR, 'facility_master.json'), 'utf8'))
  if (!_channelRows) _channelRows = JSON.parse(readFileSync(join(DATA_DIR, 'channel_desc.json'), 'utf8'))
  if (!_regionRows) _regionRows = JSON.parse(readFileSync(join(DATA_DIR, 'state_region_wh.json'), 'utf8'))
  return { facilityRows: _facilityRows, channelRows: _channelRows, regionRows: _regionRows }
}

export function buildFacilityMaps() {
  const { facilityRows, regionRows, channelRows } = loadRefData()
  const facilityToLocation = new Map()
  const facilityToType = new Map()
  const facilityToStatus = new Map()
  const facilityToDisplayName = new Map()
  const locationToFacilities = new Map()
  for (const r of facilityRows) {
    if (!r.Facility || !r.Location) continue
    facilityToLocation.set(r.Facility, r.Location)
    facilityToType.set(r.Facility, r.FacilityType || 'Regular')
    facilityToStatus.set(r.Facility, r['FCs Status for Invt'] || 'Not Live')
    facilityToDisplayName.set(r.Facility, r.Facility2 || r.Facility)
    if (!locationToFacilities.has(r.Location)) locationToFacilities.set(r.Location, [])
    locationToFacilities.get(r.Location).push(r.Facility)
  }
  const stateToNearestWH = new Map()
  const stateToRegion = new Map()
  for (const r of regionRows) {
    if (!r.shipping_address_state) continue
    stateToNearestWH.set(norm(r.shipping_address_state), r.nearest_wh)
    stateToRegion.set(norm(r.shipping_address_state), r.region)
  }
  // Derive Location -> Region by majority vote across states that route there
  const locationRegionVotes = new Map()
  for (const r of regionRows) {
    if (!r.nearest_wh || !r.region) continue
    if (!locationRegionVotes.has(r.nearest_wh)) locationRegionVotes.set(r.nearest_wh, new Map())
    const votes = locationRegionVotes.get(r.nearest_wh)
    votes.set(r.region, (votes.get(r.region) || 0) + 1)
  }
  const locationToRegion = new Map()
  for (const [loc, votes] of locationRegionVotes) {
    let best = null, bestCount = -1
    for (const [region, count] of votes) if (count > bestCount) { best = region; bestCount = count }
    locationToRegion.set(loc, best)
  }
  // channel code -> unified channel name
  const channelToUnified = new Map()
  // channel code -> channel_description (Purchase Order / Stock transfer / B2C Order / B2B Order / Ignore / Custom)
  const channelToDescription = new Map()
  for (const r of channelRows) {
    if (!r.uniware_channels) continue
    channelToUnified.set(norm(r.uniware_channels), r.unified_channel || r.uniware_channels)
    channelToDescription.set(norm(r.uniware_channels), r.channel_description || null)
  }
  return { facilityToLocation, facilityToType, facilityToStatus, facilityToDisplayName, locationToFacilities, stateToNearestWH, stateToRegion, locationToRegion, channelToUnified, channelToDescription }
}

// A sales row counts toward "B2C" avg sale only if its channel_description is
// exactly "B2C Order". Unmatched/unknown channels (~0.3% of rows) are excluded
// from B2C, not counted as B2C-by-default.
export const isB2CChannel = (channel, channelToDescription) => channelToDescription.get(norm(channel)) === 'B2C Order'

// "Total Avg Sale" (the all-channel KPI, distinct from the B2C-only figure that drives
// DOI) only counts real demand channels — B2C Order, B2B Order, Purchase Order. Channels
// like Stock transfer/Ignore/Custom (e.g. VAS, which maps to "Ignore") aren't actual sales
// and must not inflate this number.
const TOTAL_AVG_SALE_CHANNEL_DESCRIPTIONS = new Set(['B2C Order', 'B2B Order', 'Purchase Order'])
export const isTotalAvgSaleChannel = (channel, channelToDescription) => TOTAL_AVG_SALE_CHANNEL_DESCRIPTIONS.has(channelToDescription.get(norm(channel)))

export const norm = s => (s == null ? '' : String(s).trim().toUpperCase())
export const normSku = s => norm(s).replace(/[\s_]+/g, '')
// Trims whitespace-only variants of the same label (e.g. "Footwear" vs "Footwear ")
// so they don't fragment into duplicate rows in charts/tables.
export const cleanLabel = s => (s == null ? '' : String(s).trim())

// Final_SKU parsing — cut at whichever comes first: the first underscore, or a
// hyphen-prefixed "-RAW"/"-raw" segment; else keep the full string. Trailing
// underscores become spaces, then trimmed. Two independent cut points (not "cut
// before RAW anywhere in the string") because inward-time naming inconsistently
// uses either separator — taking whichever is earliest handles both without
// over-truncating codes where the real product code itself contains an underscore
// segment before a later "_RAW_"/"_PO.." suffix (e.g. "FR-CBS-BL1_COVER_RAW_PO165").
export function parseFinalSku(itemSkuCode) {
  const sku = String(itemSkuCode || '')
  const underscorePos = sku.indexOf('_')
  const rawHyphenMatch = /-raw/i.exec(sku)
  const rawHyphenPos = rawHyphenMatch ? rawHyphenMatch.index : -1
  let cutPos = sku.length
  if (underscorePos >= 0) cutPos = Math.min(cutPos, underscorePos)
  if (rawHyphenPos >= 0) cutPos = Math.min(cutPos, rawHyphenPos)
  const base = sku.slice(0, cutPos)
  return base.replace(/_/g, ' ').trim()
}

// ── ProductId → Master SKU mapping ───────────────────────────────────────────
// Duplicate/alias SKUs get created at inward time (e.g. FR-EHP-G1 inwarded as a
// stand-in for FR-IMP-EHP1) — the productid_sku_mapping sheet is the source of
// truth for "these are really the same product." Every SKU-bearing query must
// resolve through this BEFORE the item-master lookup, or a duplicate's stock/sales
// sit under a key the item master doesn't recognize and silently vanish as
// "Uncategorized" instead of rolling into the real product's totals.
export function buildSkuMap(mappingRows) {
  const map = new Map()
  for (const r of mappingRows) {
    const productId = normSku(r.productid)
    const masterSku = normSku(r.masterskucode)
    if (!productId || !masterSku) continue
    map.set(productId, masterSku)
  }
  return map
}

// Resolves a raw ItemSkuCode/final_sku through parseFinalSku, then through the
// productid→masterskucode map — falling back to the parsed code itself when no
// mapping row exists (most SKUs aren't duplicated and map to themselves).
export function resolveMasterSkuKey(rawSkuCode, skuMap) {
  const finalSku = parseFinalSku(rawSkuCode)
  const key = normSku(finalSku)
  if (!key) return { key, finalSku }
  const mapped = skuMap.get(key)
  return mapped ? { key: mapped, finalSku: mapped } : { key, finalSku }
}

// Pack_Qty — digits after "PO"/"P0" (letter-O or zero, case-insensitive), tolerating an
// optional underscore/space between the marker and the number (seen in the data as
// "_PO25", "_PO_25", "_P0_40"); default 1.
export function parsePackQty(itemSkuCode) {
  const sku = String(itemSkuCode || '')
  const match = /P[O0][_\s]*(\d+)/i.exec(sku)
  if (!match) return 1
  const qty = parseInt(match[1], 10)
  return Number.isFinite(qty) && qty > 0 ? qty : 1
}

// "RAW" plus its recurring inward-time typo variants "RW"/"RWA" — matched only as a
// standalone hyphen/underscore-delimited segment (e.g. "-RW", "_RW_", "-RWA") so real
// product codes that merely contain "RW" as part of a longer token (color/size suffixes
// like "-RW1", or unrelated codes like "SCRW") aren't misclassified as raw material.
export const isRawSkuText = sku => {
  const s = String(sku || '').toUpperCase()
  if (s.includes('RAW')) return true
  return /[_-]RWA?(?=[_-]|$)/.test(s)
}

// Pseudo-SKUs (coupon/gift-card/administrative codes like COUP1000, COUP500, DFA...)
// are not physical stock and must be excluded from every inventory computation.
export const isPseudoSku = sku => {
  const s = String(sku || '').toUpperCase()
  return s.includes('COUP') || s.includes('DFA')
}

// Total Inventory / Raw_Inventory / RTD_Inventory — mirrors the 3 calculated columns.
// The query supplying `row` must already be deduplicated to one row per (ItemSkuCode,
// Facility) — taking the latest by Updated/_daton_batch_runtime — and must select
// Inventory_st/InventoryBlocked_st (cast to numeric, aliased to the base names) —
// those are where live data actually is on this table today. See api/inventory.js.
export function computeRowInventory(row) {
  const inv2 = Number(row.Inventory || 0)
  const blocked2 = Number(row.InventoryBlocked || 0)
  const packQty = parsePackQty(row.ItemSkuCode)
  const isRawCategory = isRawSkuText(row.ItemSkuCode) || String(row.ItemSkuCode || '').toLowerCase() === 'raw'
  // Available and blocked are computed separately (both scaled by Pack_Qty for raw SKUs)
  // so callers can report "Blocked Raw Inventory" on its own rather than folded into RAW.
  const availableInventory = isRawCategory ? packQty * inv2 : inv2
  const blockedInventory = isRawCategory ? packQty * blocked2 : 0
  const totalInventory = availableInventory + blockedInventory

  const isRawFacilityRow = row.Facility === 'myfrido-Vadgaon_ITEM' || packQty > 1 || isRawSkuText(row.ItemSkuCode)
  const rawInvt = isRawFacilityRow ? availableInventory : 0
  const rawBlockedInvt = isRawFacilityRow ? blockedInventory : 0
  const rtdInvt = isRawFacilityRow ? 0 : totalInventory
  return { totalInventory, rawInvt, rawBlockedInvt, rtdInvt, packQty }
}

// RTD Level — matches the original PBIX RTDLevelFilter: RTD_Invt ÷ Avg_Sale < 2 → "Low", else "Sufficient".
export function rtdLevel(rtdInvt, avgSale) {
  if (avgSale === 0) return rtdInvt > 0 ? 'Sufficient' : 'Low'
  return rtdInvt / avgSale < 2 ? 'Low' : 'Sufficient'
}

// ── Stock status (roadmap v2 thresholds — simple, configurable-later bands) ──
// Critical <= 2d, Low 2-15d, Sufficient 15-45d, Excess > 45d.
// "Dead / No Sale" overrides all of the above when there's been no sale in the
// trailing dead-stock window (default 90d) and the SKU isn't a recent launch.
export const DOI_BANDS = { critical: 2, low: 15, sufficient: 45 }
export const REORDER_POINT_DOI = 15 // matches the Low/Sufficient boundary

export function stockStatus(doi, avgSale, invt, { isDead = false } = {}) {
  if (invt === 0) return 'Out of Stock'
  if (isDead) return 'Dead / No Sale'
  if (avgSale === 0) return 'No Demand'
  if (doi <= DOI_BANDS.critical) return 'Critical'
  if (doi <= DOI_BANDS.low) return 'Low'
  if (doi <= DOI_BANDS.sufficient) return 'Sufficient'
  return 'Excess'
}

export function requiredStock(avgSale, leadTime, productSource, totalInvt) {
  const bufferDays = productSource === 'Outsourced' ? 35 : productSource === 'Imported' ? 45 : 30
  const bufferStock = avgSale * bufferDays
  const ltRequirement = avgSale * (leadTime || 0)
  return bufferStock + ltRequirement - totalInvt
}

// ── Launch date parsing (item_master.SKU_First_Sales_Date; "NaT" = missing) ──
export function parseLaunchDate(raw) {
  if (!raw || raw === 'NaT') return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function isNewLaunch(launchDate, asOfDate, windowDays = 90) {
  if (!launchDate) return false
  const diffDays = (asOfDate - launchDate) / 86400000
  return diffDays >= 0 && diffDays <= windowDays
}
