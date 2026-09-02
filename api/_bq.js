import { BigQuery } from '@google-cloud/bigquery'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

let bq
export function getBQ() {
  if (!bq) {
    if (process.env.GCP_SA_KEY) {
      const keyPath = join(tmpdir(), 'sa_key.json')
      writeFileSync(keyPath, process.env.GCP_SA_KEY)
      bq = new BigQuery({ keyFilename: keyPath, projectId: 'frido-429506' })
    } else {
      // local dev — sa_key.json sits at project root (one level up from api/)
      bq = new BigQuery({ keyFilename: join(dirname(fileURLToPath(import.meta.url)), '..', 'sa_key.json'), projectId: 'frido-429506' })
    }
  }
  return bq
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// api/bq.js fires ~150 distinct queries per request in one Promise.all — firing them all as
// truly concurrent BigQuery jobs regularly trips BigQuery's per-user JobService.query rate limit
// (confirmed 2026-08-19: real 500s in production, which made the frontend silently keep showing
// stale data — see App.jsx's fetchData). runQueriesLimited caps how many queries are in flight at
// once and retries a rate-limited query with backoff instead of failing the whole request.
const QUERY_CONCURRENCY = 12
const MAX_RETRIES = 4
async function runQueryWithRetry(bqClient, sql, key) {
  for (let attempt = 0; ; attempt++) {
    try {
      const [rows] = await bqClient.query({ query: sql })
      return { key, rows }
    } catch (e) {
      const isRateLimit = e?.code === 403 && /rateLimitExceeded|Exceeded rate limits/i.test(e?.message || '')
      if (!isRateLimit || attempt >= MAX_RETRIES) throw e
      // Exponential backoff with jitter: 500ms, 1s, 2s, 4s (+ up to 250ms jitter)
      await sleep(500 * 2 ** attempt + Math.random() * 250)
    }
  }
}

// Runs {key: sql} query map with bounded concurrency instead of api/bq.js's old
// Object.entries(queries).map(...) + Promise.all, which fired every query at once.
export async function runQueriesLimited(bqClient, queries) {
  const entries = Object.entries(queries)
  const results = new Array(entries.length)
  let nextIndex = 0
  async function worker() {
    while (true) {
      const i = nextIndex++
      if (i >= entries.length) return
      const [key, sql] = entries[i]
      results[i] = await runQueryWithRetry(bqClient, sql, key)
    }
  }
  const workers = Array.from({ length: Math.min(QUERY_CONCURRENCY, entries.length) }, worker)
  await Promise.all(workers)
  return results
}

// ============================================================================
// Shared "measures" layer — every sub-tab (Shopify, Amazon, EBO, Offline, ...)
// must compute Net Revenue / GST / return-rate KPIs identically. Two pieces:
//
//   1. netRevenueSelectFragment(tableAlias) — a SQL SELECT fragment to drop into
//      any `WITH q AS (${base}) SELECT ${netRevenueSelectFragment('q')} FROM q
//      WHERE ...` query. Returns the 6 raw sums every measure is built from.
//   2. computeNetRevenueMeasures(row) — takes that SQL row (or an equivalent
//      object) and derives CIR%/RTO%/Return%/Cancellation%/Net Revenue/GST Amount
//      with one formula, so no tab re-derives this math with slightly different
//      variable names.
//
// Formula (confirmed 2026-07-31): all % rates are share-of-Gross-Inc-GST,
// computed in whatever filter/slicer context surrounds the query (so they stay
// "slicer-friendly" — a category/SKU/date filter changes the numerator AND
// denominator together, same as a DAX measure). Order matters:
//   retainedShare    = 1 − cirPct − rtoPct − returnPct − cancelPct
//   netRevenueExcGst = grossExcGst × retainedShare
//   gstAmount        = (grossIncGst − grossExcGst) × retainedShare
// i.e. GST is removed from the SAME retained portion Net Revenue is computed
// from — not derived separately from a different base.
// ============================================================================
export function netRevenueSelectFragment(alias = '') {
  const p = alias ? `${alias}.` : ''
  return `SUM(${p}SellingPrice_Inc_GST) AS gross_inc_gst,
    SUM(${p}SellingPrice_Exc_GST) AS gross_exc_gst,
    SUM(CASE WHEN ${p}Order_Status = 'CIR' THEN ${p}SellingPrice_Inc_GST ELSE 0 END) AS cir_rev,
    SUM(CASE WHEN ${p}Order_Status = 'RTO' THEN ${p}SellingPrice_Inc_GST ELSE 0 END) AS rto_rev,
    SUM(CASE WHEN ${p}Order_Status = 'Return' THEN ${p}SellingPrice_Inc_GST ELSE 0 END) AS return_rev,
    SUM(CASE WHEN ${p}Order_Status = 'Cancelled' THEN ${p}SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev,
    SUM(CASE WHEN ${p}Order_Status = 'Exchange' THEN ${p}SellingPrice_Inc_GST ELSE 0 END) AS exch_rev`
}

export function computeNetRevenueMeasures(row = {}) {
  const grossIncGst = parseFloat(row.gross_inc_gst) || 0
  const grossExcGst = parseFloat(row.gross_exc_gst) || 0
  const cirRev = parseFloat(row.cir_rev) || 0
  const rtoRev = parseFloat(row.rto_rev) || 0
  const returnRev = parseFloat(row.return_rev) || 0
  const cancelRev = parseFloat(row.cancel_rev) || 0
  const codCancelRev = parseFloat(row.cod_cancel_rev) || 0
  const exchRev = parseFloat(row.exch_rev) || 0
  // Prepaid-only slice of cancellations — used for "Overall Return%" (confirmed 2026-08-19),
  // a separate metric from the Net Revenue deduction below, which uses full cancelRev.
  const prepaidCancelRev = cancelRev - codCancelRev

  // Individual rate cards (CIR%, RTO%, Return%, Cancel%) are each irrespective of payment type —
  // no COD carve-out.
  const cirPct = grossIncGst > 0 ? cirRev / grossIncGst : 0
  const rtoPct = grossIncGst > 0 ? rtoRev / grossIncGst : 0
  const returnPct = grossIncGst > 0 ? returnRev / grossIncGst : 0
  const cancelPct = grossIncGst > 0 ? cancelRev / grossIncGst : 0
  const exchPct = grossIncGst > 0 ? exchRev / grossIncGst : 0

  // Overall Return% = RTO + CIR + Return-status + prepaid-only Cancellation (confirmed 2026-08-19).
  // Return-status is the catch-all bucket for orders (mostly marketplace) where the specific
  // return type isn't identifiable — it stays in every returns/deduction total below.
  const overallReturnPct = grossIncGst > 0 ? (rtoRev + cirRev + returnRev + prepaidCancelRev) / grossIncGst : 0

  // Net Revenue deducts RTO + CIR + Return + FULL Cancellation (COD included) — Exchange is NOT
  // deducted (reverted 2026-08-19): the customer keeps a product either way, so an exchange isn't
  // lost revenue. The double-counting risk this briefly introduced (the ops team recreates a new
  // '_EX...' OrderId that also carries Order_Status='Exchange') is instead solved by excluding
  // '_EX' OrderIds entirely at the base query (buildQuery above) — so this formula no longer needs
  // to special-case Exchange at all; the original order's own revenue flows through normally.
  const retainedShare = Math.max(0, 1 - (rtoRev + cirRev + returnRev + cancelRev) / (grossIncGst || 1))

  const netRevenueExcGst = grossExcGst * retainedShare
  const gstAmount = (grossIncGst - grossExcGst) * retainedShare
  const netRevenueIncGst = netRevenueExcGst + gstAmount

  return {
    grossIncGst, grossExcGst,
    cirRev, rtoRev, returnRev, cancelRev, codCancelRev, prepaidCancelRev, exchRev,
    cirPct, rtoPct, returnPct, cancelPct, exchPct,
    totalReturnPct: overallReturnPct,
    retainedShare,
    netRevenueExcGst, netRevenueIncGst, gstAmount,
  }
}

// Amazon Vendor Central returns fragment — the ONE canonical returned_units/return_rev pair for
// VC, shared by every VC query in bq.js (amzVCCat, amzVCSubCat, amzVCSKU, amzVCDailySKU,
// amzVCAccounts) so they can never drift into 5 slightly-different hand-copied CASE WHEN
// expressions again. VC's Order_Status vocabulary is currently just 'Sales' (delivered) /
// 'Return' (returned), with a dummy OrderId per line (AVC###### / AVCR######) — same additive
// "delivered + returned = total revenue" convention Shopify/Amazon SC/Flipkart already use.
//   returned_units — cancelled/RTO/CIR/Return unit count, used to derive net units sold
//                    (gross units − returned_units) for COGS. Includes Cancelled/RTO/CIR
//                    defensively even though VC doesn't currently emit those statuses, so this
//                    doesn't silently need updating again if VC's feed ever adds them.
//   return_rev     — Order_Status='Return' revenue only (SellingPrice_Inc_GST) — the canonical
//                    revenue-based return figure. Net Revenue = (gross − return_rev) × (1 −
//                    gstRatio), Returns% = return_rev ÷ gross — REVENUE ÷ REVENUE, never a
//                    line-item COUNT divided by a units SUM (the confirmed Sales-tab VC bug:
//                    amzVCAccounts.returns is a COUNT(DISTINCT OrderId), only ever meant for
//                    display as a raw count, never as this ratio's numerator).
export function vcReturnsSelectFragment(alias = '') {
  const p = alias ? `${alias}.` : ''
  return `SUM(CASE WHEN ${p}Order_Status IN ('Cancelled','RTO','CIR','Return') THEN ${p}ItemQty ELSE 0 END) AS returned_units,
    ROUND(SUM(CASE WHEN ${p}Order_Status='Return' THEN ${p}SellingPrice_Inc_GST ELSE 0 END),0) AS return_rev`
}

const CHANNEL_GROUPS = {
  // 'Shopify International' is now dead here — those rows moved to Channel='International' on
  // the schema change (2026-08), so this subChannels list never matches them anymore. Left as-is
  // (harmless no-op) rather than removed, since MyFrido/Mobility still need it.
  d2c:           { channels: ['Shopify'], subChannels: ['MyFrido', 'Mobility', 'Shopify International'] },
  // EBO (Retail Store) rows carry Channel='Retail', not 'Shopify' — confirmed against BQ
  // 2026-08-19 (all 35k+ Retail Store rows since 2025-08-05 use Channel='Retail'). The old
  // Channel='Shopify' definition matched zero rows, silently breaking the channelGroup=ebo filter.
  ebo:           { channels: ['Retail'], subChannels: ['Retail Store'] },
  marketplace:   { channels: ['Amazon', 'Flipkart', 'CRED', 'Myntra', 'Firstcry'] },
  quick_commerce:{ channels: ['Blinkit', 'Zepto', 'Instamart'] },
  offline:       { channels: ['offline_sales'] },
  // New unified International channel (both Amazon International + Shopify International sub-
  // brands) — Channel='International' rows, added 2026-08 schema change. See PnL "International" tab.
  international: { channels: ['International'] },
}

export function buildQuery(s, e, filters = {}) {
  const { category, subCategory, state, sku, subChannel, voucher, region, tier, city, country, paymentType, channelGroup } = filters
  // Filters now reference the dbt fact table columns directly (u.Category, u.SubCategory, u.masterskucode).
  // Region/Tier still come from pincode_city_master join (pm/cm).
  const whereClauses = []

  if (channelGroup) {
    const groups = channelGroup.split(',').map(g => g.trim()).filter(g => CHANNEL_GROUPS[g])
    if (groups.length > 0) {
      const parts = groups.map(g => {
        const def = CHANNEL_GROUPS[g]
        const chList = def.channels.map(c => `'${c}'`).join(',')
        if (def.subChannels) {
          const scList = def.subChannels.map(c => `'${c}'`).join(',')
          return `(u.Channel IN (${chList}) AND u.SubChannel IN (${scList}))`
        }
        return `u.Channel IN (${chList})`
      })
      whereClauses.push(parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`)
    }
  }
  if (category) {
    const cats = category.split(',').map(c => c.trim()).filter(Boolean)
    if (cats.length === 1) whereClauses.push(`im.Category_Name = '${cats[0].replace(/'/g, "''")}'`)
    else if (cats.length > 1) whereClauses.push(`im.Category_Name IN (${cats.map(c => `'${c.replace(/'/g, "''")}'`).join(',')})`)
  }
  if (subCategory) {
    const escapeSub = s => s.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\n/g, ' ').replace(/\r/g, '')
    const subs = subCategory.split(',').map(c => c.trim()).filter(Boolean)
    if (subs.length === 1) whereClauses.push(`im.Sub_category = '${escapeSub(subs[0])}'`)
    else if (subs.length > 1) whereClauses.push(`im.Sub_category IN (${subs.map(c => `'${escapeSub(c)}'`).join(', ')})`)
  }
  if (state) {
    const vals = state.split(',').map(s => s.trim()).filter(Boolean)
    if (vals.length === 1) whereClauses.push(`UPPER(TRIM(COALESCE(pm.State, cm.State, u.State))) = '${vals[0].toUpperCase().replace(/'/g, "''")}'`)
    else if (vals.length > 1) whereClauses.push(`UPPER(TRIM(COALESCE(pm.State, cm.State, u.State))) IN (${vals.map(s => `'${s.toUpperCase().replace(/'/g, "''")}'`).join(',')})`)
  }
  if (region) {
    const vals = region.split(',').map(r => r.trim()).filter(Boolean)
    if (vals.length === 1) whereClauses.push(`COALESCE(pm.Region, cm.Region) = '${vals[0].replace(/'/g, "''")}'`)
    else if (vals.length > 1) whereClauses.push(`COALESCE(pm.Region, cm.Region) IN (${vals.map(r => `'${r.replace(/'/g, "''")}'`).join(',')})`)
  }
  if (city) whereClauses.push(`COALESCE(pm.City_L1, cm.City_L1, u.City) = '${city.replace(/'/g, "''")}'`)
  if (tier) {
    // City_Tier in pincode_city_master is stored as a STRING ("Tier I", "Tier II", "Tier III")
    // — keep the label as-is when comparing.
    const NUM_TO_LABEL = { '1': 'Tier I', '2': 'Tier II', '3': 'Tier III' }
    const vals = tier.split(',').map(t => {
      const trimmed = t.trim()
      // Accept both label form ("Tier I") and numeric form ("1")
      return NUM_TO_LABEL[trimmed] || trimmed
    }).filter(Boolean)
    if (vals.length === 1) whereClauses.push(`COALESCE(pm.City_Tier, cm.City_Tier) = '${vals[0].replace(/'/g, "''")}'`)
    else if (vals.length > 1) whereClauses.push(`COALESCE(pm.City_Tier, cm.City_Tier) IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`)
  }
  if (sku) {
    const skuList = sku.split(',').map(s => s.trim()).filter(Boolean)
    if (skuList.length === 1) {
      const s1 = skuList[0].replace(/'/g, "''")
      whereClauses.push(`u.masterskucode = '${s1}'`)
    } else if (skuList.length > 1) {
      const inList = skuList.map(s => `'${s.replace(/'/g, "''")}'`).join(', ')
      whereClauses.push(`u.masterskucode IN (${inList})`)
    }
  }
  if (subChannel) {
    const vals = subChannel.split(',').map(v => v.trim()).filter(Boolean)
    // 'International' maps to SubChannel = 'Shopify International' in the main table.
    // 'ShopifyIndia' means Shopify but NOT international.
    if (vals.length === 1 && vals[0] === 'International') {
      whereClauses.push(`u.SubChannel = 'Shopify International'`)
    } else if (vals.length === 1 && vals[0] === 'ShopifyIndia') {
      // International orders now carry Channel='International' (not 'Shopify'), so the old
      // "Channel != 'Shopify' OR SubChannel != 'Shopify International'" pair is trivially true
      // for them (first half alone passes) — leaks Shopify-International rows back into
      // "ShopifyIndia". Exclude by SubChannel alone instead, since SubChannel itself is unchanged.
      whereClauses.push(`u.SubChannel != 'Shopify International'`)
    } else if (vals.length === 1) {
      whereClauses.push(`u.SubChannel = '${vals[0].replace(/'/g, "''")}'`)
    } else if (vals.length > 1) {
      const hasIntl = vals.includes('International')
      const otherVals = vals.filter(v => v !== 'International')
      if (hasIntl && otherVals.length === 0) {
        whereClauses.push(`u.SubChannel = 'Shopify International'`)
      } else if (hasIntl) {
        const subChList = otherVals.map(v => `'${v.replace(/'/g, "''")}'`).join(', ')
        whereClauses.push(`(u.SubChannel IN (${subChList}) OR u.SubChannel = 'Shopify International')`)
      } else {
        whereClauses.push(`u.SubChannel IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(', ')})`)
      }
    }
  }
  if (country) {
    const vals = country.split(',').map(v => v.trim()).filter(Boolean)
    // For International subChannel, country filter targets the Country column (UAE/UK/US).
    // Otherwise it targets ChannelAccount (marketplace/storefront).
    const col = subChannel === 'International' ? 'u.Country' : 'u.ChannelAccount'
    if (vals.length === 1) whereClauses.push(`${col} = '${vals[0].replace(/'/g, "''")}'`)
    else if (vals.length > 1) whereClauses.push(`${col} IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(', ')})`)
  }
  if (voucher) {
    const codes = voucher.split(',').map(v => v.trim()).filter(Boolean)
    if (codes.length > 0) {
      const inList = codes.map(c => `'${c.replace(/'/g, "''")}'`).join(', ')
      whereClauses.push(`TRIM(u.voucher_code) IN (${inList})`)
    }
  }
  if (paymentType) {
    const vals = paymentType.split(',').map(v => v.trim()).filter(Boolean)
    if (vals.length === 1) whereClauses.push(`u.payment_type = '${vals[0].replace(/'/g, "''")}'`)
    else if (vals.length > 1) whereClauses.push(`u.payment_type IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(', ')})`)
  }
  // ============================================================================
  // Source: frido-429506.production.fact_all_platform_sales_report (dbt model)
  // Already has: Category, SubCategory, GST_Tax_Type_Code, masterskucode, Order_Status,
  //              is_CIR_return, is_exchange, is_rto, is_cancelled, is_refund,
  //              payment_type, Clickpost_Status, Unicommerce_Status, etc.
  // We only enrich with pincode_city_master for Region/City_Tier/Tier_Label/Is_Metro_City.
  // ============================================================================
  // Column aliases for backward compatibility with bq.js:
  //   masterskucode  -> MasterSKU
  //   payment_type   -> PaymentMode
  const whereClause = whereClauses.length ? `AND ${whereClauses.join(' AND ')} ` : ''
  return `WITH
pincode_master AS (
  SELECT DISTINCT CAST(Pincode AS STRING) AS pincode, City_L1, City_L2, State, Region, City_Tier, Tier_Label, Is_Metro_City
  FROM \`frido-429506.production.pincode_city_master\`
),
city_name_master AS (
  -- City_L1 alone is not unique in pincode_city_master (the same city name can appear with
  -- several distinct City_L2/State/Region combos across pincodes), so a plain SELECT DISTINCT
  -- still yields multiple rows per City_L1. That fanned out the Blinkit/Zepto/Instamart join
  -- below (which matches on City_L1 only), silently inflating their revenue. Collapse to one
  -- representative row per City_L1 so the join can never multiply a sales row.
  SELECT City_L1, ANY_VALUE(City_L2) AS City_L2, ANY_VALUE(State) AS State, ANY_VALUE(Region) AS Region,
         ANY_VALUE(City_Tier) AS City_Tier, ANY_VALUE(Tier_Label) AS Tier_Label, ANY_VALUE(Is_Metro_City) AS Is_Metro_City
  FROM \`frido-429506.production.pincode_city_master\`
  GROUP BY City_L1
),
item_master AS (
  -- Product_Code is the item master's SKU key. Normalize both sides (uppercase, trim, strip
  -- everything but A-Z/0-9/hyphen) so invisible unicode chars, en-dashes, and stray whitespace
  -- in either source don't silently break the join. Category/SubCategory now come from here —
  -- the fact table's own Category/SubCategory columns are a dbt-side default and can be wrong
  -- (e.g. placeholder "Frido"/"Frido" for SKUs dbt couldn't map) — item master is the source of truth.
  -- Spare-part categories (e.g. "Sparepart (Chair & Mobility)") are folded into "Others" too —
  -- they're a small, miscellaneous bucket that doesn't warrant its own row alongside real products.
  SELECT
    REGEXP_REPLACE(UPPER(TRIM(Product_Code)), r'[^A-Z0-9-]', '') AS sku_key,
    CASE WHEN LOWER(ANY_VALUE(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE ANY_VALUE(Category_Name) END AS Category_Name,
    CASE WHEN LOWER(ANY_VALUE(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE ANY_VALUE(Sub_category) END AS Sub_category,
    SAFE_CAST(NULLIF(TRIM(ANY_VALUE(GST_Tax_Type_Code)), '') AS FLOAT64) AS GST_Rate,
    -- Per-unit weight in grams, used by the PnL tab's SnD (Shipping & Distribution) cost —
    -- see PNL_TAB_ROADMAP.md. Line-item weight = Weight_gms * ItemQty.
    SAFE_CAST(NULLIF(TRIM(ANY_VALUE(Weight_gms)), '') AS FLOAT64) AS Weight_gms
  FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
  WHERE Product_Code IS NOT NULL AND TRIM(Product_Code) != ''
  GROUP BY sku_key
)
SELECT
  u.Country, u.OrderId, u.Channel, u.SubChannel, u.ChannelAccount, u.OrderDate,
  COALESCE(pm.State, cm.State, u.State) AS State,
  COALESCE(pm.City_L1, cm.City_L1, u.City) AS City,
  COALESCE(pm.City_L2, cm.City_L2) AS City_L2,
  u.Pincode,
  COALESCE(pm.Region, cm.Region) AS Region,
  COALESCE(pm.City_Tier, cm.City_Tier) AS City_Tier,
  COALESCE(pm.Tier_Label, cm.Tier_Label) AS Tier_Label,
  COALESCE(pm.Is_Metro_City, cm.Is_Metro_City, FALSE) AS Is_Metro_City,
  u.ProductId, u.ChannelSKUCode,
  CAST(u.ItemQty AS FLOAT64) AS ItemQty,
  u.SellingPrice_Inc_GST,
  u.SellingPrice_Exc_GST,
  u.OrderTrackingStatus, u.FulfilmentStatus, u.FinancialStatus,
  u.Tax,
  u.fulfillment_channel, u.RefundStatus,
  u.payment_type AS PaymentMode,
  u.CustomerId, u.voucher_code,
  COALESCE(im.Category_Name, 'Others') AS Category,
  COALESCE(im.Sub_category, 'Others') AS SubCategory,
  COALESCE(im.GST_Rate, SAFE_CAST(NULLIF(TRIM(u.GST_Tax_Type_Code), '') AS FLOAT64)) AS GST_Tax_Type_Code,
  im.Weight_gms,
  -- Per-line GST amount, back-calculated from the SKU's real GST slab (item master GST_Tax_Type_Code,
  -- falling back to the fact table's own rate when the SKU isn't in item master) applied to the
  -- GST-inclusive selling price. Only meaningful for non-cancelled/RTO/Return/CIR lines — callers
  -- that want "GST on completed orders only" should filter Order_Status before summing this.
  ROUND(u.SellingPrice_Inc_GST * SAFE_DIVIDE(
    COALESCE(im.GST_Rate, SAFE_CAST(NULLIF(TRIM(u.GST_Tax_Type_Code), '') AS FLOAT64)),
    100 + COALESCE(im.GST_Rate, SAFE_CAST(NULLIF(TRIM(u.GST_Tax_Type_Code), '') AS FLOAT64))
  ), 2) AS GST_Amount,
  u.masterskucode AS MasterSKU,
  -- RefundStatus is BOOL in the source table as of the current schema, but was a STRING
  -- ('true'/'1') at some point historically — CAST to STRING so this keeps working across
  -- either representation instead of erroring on a BOOL/STRING type mismatch.
  CASE WHEN CAST(u.RefundStatus AS STRING) IN ('true', '1') THEN 1 ELSE 0 END AS is_refund,
  u.Clickpost_Status, u.Unicommerce_Status, u.Order_Status,
  u.Dispatch_Date, u.Delivered_Date
FROM \`frido-429506.production.fact_all_platform_sales_report\` u
LEFT JOIN pincode_master pm ON u.Pincode IS NOT NULL AND TRIM(CAST(u.Pincode AS STRING)) = pm.pincode
LEFT JOIN city_name_master cm ON pm.pincode IS NULL AND u.Channel IN ('Blinkit','Zepto','Instamart') AND cm.City_L1 = CASE UPPER(TRIM(u.City)) WHEN 'BANGALORE' THEN 'Bengaluru' WHEN 'GURGAON' THEN 'Gurugram' WHEN 'DELHI' THEN 'New Delhi' WHEN 'SAS NAGAR' THEN 'Mohali' ELSE INITCAP(TRIM(u.City)) END
LEFT JOIN item_master im ON REGEXP_REPLACE(UPPER(TRIM(u.masterskucode)), r'[^A-Z0-9-]', '') = im.sku_key
WHERE u.OrderDate BETWEEN '${s}' AND '${e}'
  -- NOT (... = 'x') evaluates to NULL (not TRUE) whenever Order_Status IS NULL, and a WHERE
  -- clause drops any row whose condition isn't TRUE — so an unguarded NOT(...) here silently
  -- excluded every row with a null Order_Status, not just the intended Credit Note/RTV ones.
  -- COALESCE(Order_Status, '') keeps the comparison NULL-safe so null-status rows survive.
  ${filters.includeCreditNotes ? '' : `AND NOT (u.Channel = 'offline_sales' AND COALESCE(u.Order_Status, '') = 'Credit Note')`}
  -- Amazon RTV (Return-to-Vendor) rows are warehouse stock movements, not customer sales —
  -- they carry real ItemQty but zero SellingPrice, which silently inflates unit/qty totals
  -- across every Amazon metric that sums units. Excluded at the source so no downstream query
  -- needs to remember to filter them out individually. Filtered on Order_Status directly
  -- (not the 'S02-' OrderId prefix) since that's the actual, reliable signal — some RTV rows
  -- may not follow the S02- naming convention.
  AND NOT (u.Channel = 'Amazon' AND COALESCE(u.Order_Status, '') = 'RTV (Return to vendor)')
  -- Exchange process (confirmed 2026-08-19): when a Shopify order gets exchanged, Frido's ops
  -- team recreates a NEW OrderId with an '_EX...' suffix (e.g. '#MF0223023108_EX160'), copies over
  -- the original order's details, and ships the replacement product under that new ID. Both the
  -- original OrderId and its '_EX...' recreation independently carry Order_Status='Exchange' with
  -- real, non-zero SellingPrice — summing both double-counts the same underlying sale (confirmed:
  -- July 2026 MyFrido had 14,671 original vs only 690 recreated rows tagged Exchange, since most
  -- recreations land in a later month than the original order). The recreated '_EX' row is pure
  -- re-shipment bookkeeping, not a second sale, so it's excluded here at the source — the original
  -- order's own revenue/Gross/Net treatment is untouched and unaffected by this filter.
  AND NOT (u.OrderId LIKE '%_EX%')
  ${whereClause}
ORDER BY u.OrderDate DESC`
}

const unwrap = v => {
  if (v == null) return null
  if (typeof v === 'object' && v.value !== undefined) return v.value
  return v
}

export async function syncRange(pool, start, end) {
  const bq = getBQ()
  const t0 = Date.now()
  console.log(`[BQ] Fetching ${start} → ${end}`)
  const [bqRows] = await bq.query({ query: buildQuery(start, end), maximumBytesBilled: '10000000000' })
  console.log(`[BQ] Got ${bqRows.length} rows in ${((Date.now()-t0)/1000).toFixed(1)}s`)

  await pool.query(`DELETE FROM orders WHERE order_date BETWEEN $1 AND $2`, [start, end])
  if (bqRows.length === 0) return 0

  const BATCH = 500
  for (let i = 0; i < bqRows.length; i += BATCH) {
    const batch = bqRows.slice(i, i + BATCH)
    const values = [], params = []
    let p = 1
    for (const r of batch) {
      values.push(`($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6},$${p+7},$${p+8},$${p+9},$${p+10},$${p+11},$${p+12},$${p+13},$${p+14},$${p+15},$${p+16},$${p+17},$${p+18},$${p+19},$${p+20},$${p+21},$${p+22},$${p+23},$${p+24},$${p+25},$${p+26},$${p+27},$${p+28},$${p+29},$${p+30})`)
      p += 31
      const taxRaw = unwrap(r.Tax)
      const taxNum = taxRaw && taxRaw !== 'Not Found' ? parseFloat(taxRaw) : null
      params.push(
        unwrap(r.OrderId), unwrap(r.OrderDate), unwrap(r.Channel), unwrap(r.SubChannel), unwrap(r.ChannelAccount),
        unwrap(r.Country), unwrap(r.State), unwrap(r.City), unwrap(r.Pincode), unwrap(r.ProductId),
        unwrap(r.ChannelSKUCode), unwrap(r.MasterSKU), unwrap(r.Category), unwrap(r.SubCategory),
        r.ItemQty != null ? parseFloat(unwrap(r.ItemQty)) : null,
        r.SellingPrice_Inc_GST != null ? parseFloat(unwrap(r.SellingPrice_Inc_GST)) : null,
        r.SellingPrice_Exc_GST != null ? parseFloat(unwrap(r.SellingPrice_Exc_GST)) : null,
        taxNum, unwrap(r.GST_Tax_Type_Code), unwrap(r.PaymentMode), unwrap(r.CustomerId), unwrap(r.voucher_code),
        unwrap(r.FulfilmentStatus), unwrap(r.FinancialStatus), unwrap(r.Order_Status),
        r.is_rto != null ? parseInt(unwrap(r.is_rto)) : null,
        r.is_cancelled != null ? parseInt(unwrap(r.is_cancelled)) : null,
        r.is_CIR_return != null ? parseInt(unwrap(r.is_CIR_return)) : null,
        r.is_exchange != null ? parseInt(unwrap(r.is_exchange)) : null,
        unwrap(r.Dispatch_Date), unwrap(r.Delivered_Date)
      )
    }
    await pool.query(
      `INSERT INTO orders (order_id,order_date,channel,sub_channel,channel_account,country,state,city,pincode,product_id,sku_code,master_sku,category,sub_category,item_qty,revenue_inc_gst,revenue_exc_gst,tax,gst_rate,payment_mode,customer_id,voucher_code,fulfilment_status,financial_status,order_status,is_rto,is_cancelled,is_cir_return,is_exchange,dispatch_date,delivered_date) VALUES ${values.join(',')}`,
      params
    )
  }
  console.log(`[sync] ✅ ${start}→${end}: ${bqRows.length} rows in ${((Date.now()-t0)/1000).toFixed(1)}s`)
  return bqRows.length
}
