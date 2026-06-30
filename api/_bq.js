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

export function buildQuery(s, e, filters = {}) {
  const { category, subCategory, state, sku, subChannel, voucher, region, tier, city, country } = filters
  // Filters now reference the dbt fact table columns directly (u.Category, u.SubCategory, u.masterskucode).
  // Region/Tier still come from pincode_city_master join (pm/cm).
  const whereClauses = []
  if (category) {
    const cats = category.split(',').map(c => c.trim()).filter(Boolean)
    if (cats.length === 1) whereClauses.push(`u.Category = '${cats[0].replace(/'/g, "''")}'`)
    else if (cats.length > 1) whereClauses.push(`u.Category IN (${cats.map(c => `'${c.replace(/'/g, "''")}'`).join(',')})`)
  }
  if (subCategory) {
    const subs = subCategory.split(',').map(c => c.trim()).filter(Boolean)
    if (subs.length === 1) whereClauses.push(`u.SubCategory = '${subs[0].replace(/'/g, "''")}'`)
    else if (subs.length > 1) whereClauses.push(`u.SubCategory IN (${subs.map(c => `'${c.replace(/'/g, "''")}'`).join(',')})`)
  }
  if (state) {
    const vals = state.split(',').map(s => s.trim()).filter(Boolean)
    if (vals.length === 1) whereClauses.push(`UPPER(TRIM(u.State)) = '${vals[0].toUpperCase().replace(/'/g, "''")}'`)
    else if (vals.length > 1) whereClauses.push(`UPPER(TRIM(u.State)) IN (${vals.map(s => `'${s.toUpperCase().replace(/'/g, "''")}'`).join(',')})`)
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
    if (vals.length === 1) whereClauses.push(`u.SubChannel = '${vals[0].replace(/'/g, "''")}'`)
    else if (vals.length > 1) whereClauses.push(`u.SubChannel IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(', ')})`)
  }
  if (country) {
    const vals = country.split(',').map(v => v.trim()).filter(Boolean)
    if (vals.length === 1) whereClauses.push(`u.ChannelAccount = '${vals[0].replace(/'/g, "''")}'`)
    else if (vals.length > 1) whereClauses.push(`u.ChannelAccount IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(', ')})`)
  }
  if (voucher) {
    const codes = voucher.split(',').map(v => v.trim()).filter(Boolean)
    if (codes.length > 0) {
      const inList = codes.map(c => `'${c.replace(/'/g, "''")}'`).join(', ')
      whereClauses.push(`TRIM(u.voucher_code) IN (${inList})`)
    }
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
  SELECT DISTINCT City_L1, City_L2, State, Region, City_Tier, Tier_Label, Is_Metro_City
  FROM \`frido-429506.production.pincode_city_master\`
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
  u.Category, u.SubCategory, u.GST_Tax_Type_Code,
  u.masterskucode AS MasterSKU,
  u.is_CIR_return, u.is_exchange, u.is_rto, u.is_cancelled, u.is_refund,
  u.Clickpost_Status, u.Unicommerce_Status, u.Order_Status,
  u.Dispatch_Date, u.Delivered_Date
FROM \`frido-429506.production.fact_all_platform_sales_report\` u
LEFT JOIN pincode_master pm ON u.Pincode IS NOT NULL AND TRIM(CAST(u.Pincode AS STRING)) = pm.pincode
LEFT JOIN city_name_master cm ON pm.pincode IS NULL AND u.Channel IN ('Blinkit','Zepto','Instamart') AND cm.City_L1 = CASE UPPER(TRIM(u.City)) WHEN 'BANGALORE' THEN 'Bengaluru' WHEN 'GURGAON' THEN 'Gurugram' WHEN 'DELHI' THEN 'New Delhi' WHEN 'SAS NAGAR' THEN 'Mohali' ELSE INITCAP(TRIM(u.City)) END
WHERE u.OrderDate BETWEEN '${s}' AND '${e}' ${whereClause}
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
