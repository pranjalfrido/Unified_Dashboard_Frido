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
    SUM(CASE WHEN ${p}Order_Status = 'Cancelled' THEN ${p}SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev`
}

export function computeNetRevenueMeasures(row = {}) {
  const grossIncGst = parseFloat(row.gross_inc_gst) || 0
  const grossExcGst = parseFloat(row.gross_exc_gst) || 0
  const cirRev = parseFloat(row.cir_rev) || 0
  const rtoRev = parseFloat(row.rto_rev) || 0
  const returnRev = parseFloat(row.return_rev) || 0
  const cancelRev = parseFloat(row.cancel_rev) || 0
  const codCancelRev = parseFloat(row.cod_cancel_rev) || 0
  // Exclude COD cancellations from Net Rev deduction — COD cancels are pre-dispatch drops, not true returns
  const effectiveCancelRev = cancelRev - codCancelRev

  const cirPct = grossIncGst > 0 ? cirRev / grossIncGst : 0
  const rtoPct = grossIncGst > 0 ? rtoRev / grossIncGst : 0
  const returnPct = grossIncGst > 0 ? returnRev / grossIncGst : 0
  const cancelPct = grossIncGst > 0 ? effectiveCancelRev / grossIncGst : 0
  const retainedShare = Math.max(0, 1 - cirPct - rtoPct - returnPct - cancelPct)

  const netRevenueExcGst = grossExcGst * retainedShare
  const gstAmount = (grossIncGst - grossExcGst) * retainedShare
  const netRevenueIncGst = netRevenueExcGst + gstAmount

  return {
    grossIncGst, grossExcGst,
    cirRev, rtoRev, returnRev, cancelRev, codCancelRev, effectiveCancelRev,
    cirPct, rtoPct, returnPct, cancelPct,
    totalReturnPct: cirPct + rtoPct + returnPct + cancelPct,
    retainedShare,
    netRevenueExcGst, netRevenueIncGst, gstAmount,
  }
}

const CHANNEL_GROUPS = {
  d2c:           { channels: ['Shopify'], subChannels: ['MyFrido', 'Mobility', 'Shopify International'] },
  ebo:           { channels: ['Shopify'], subChannels: ['Retail Store'] },
  marketplace:   { channels: ['Amazon', 'Flipkart', 'CRED', 'Myntra', 'Firstcry'] },
  quick_commerce:{ channels: ['Blinkit', 'Zepto', 'Instamart'] },
  offline:       { channels: ['offline_sales'] },
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
    const subs = subCategory.split(',').map(c => c.trim()).filter(Boolean)
    if (subs.length === 1) whereClauses.push(`im.Sub_category = '${subs[0].replace(/'/g, "''")}'`)
    else if (subs.length > 1) whereClauses.push(`im.Sub_category IN (${subs.map(c => `'${c.replace(/'/g, "''")}'`).join(',')})`)
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
      whereClauses.push(`(u.Channel != 'Shopify' OR u.SubChannel != 'Shopify International')`)
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
  ${filters.includeCreditNotes ? '' : `AND NOT (u.Channel = 'offline_sales' AND u.Order_Status = 'Credit Note')`}
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
