// Resolves messy free-text "Order ID New" values in a Freshdesk-style incident/ticket export
// into real order IDs, then enriches each ticket with order status/dates.
//
// Pipeline (confirmed 2026-09-09):
//   1. Extract a candidate order ID from the messy text (regex-based cleanup: strip stray
//      prefixes/suffixes/punctuation, fix common typos like "MFO" -> "MF0", handle #FM short
//      codes and Amazon-style order numbers).
//   2. Try to match that candidate directly against fact_all_platform_sales_report.OrderId.
//   3. FALLBACK ONLY (not run when step 2 already matched): look up the ticket's Email in
//      fact_shopify_myfrido_mobility_all_orders and take that customer's MOST RECENT order_name.
//   4. Using whichever OrderId was resolved (step 2 or step 3), join fact_all_platform_sales_report
//      for Order Status / Order Date / Dispatch Date / Delivered Date / Refund Status, PLUS
//      Clickpost_Shipment_Tracking_Report (shipment_type='Forward' ONLY, per 2026-09-09
//      instruction -- this is the order's own forward delivery, not its return leg) for pickup
//      date, and stg_clickpost_returns_exchange for refund_processed_on/refund_status.
//   5. Tickets with no resolvable order ID (after both steps) keep RefinedOrderId and every
//      joined field blank -- NOT dropped from the output (per 2026-09-09 instruction), so the
//      match-rate is auditable.
//
// Usage: node scripts/resolve-incident-order-ids.mjs <input.csv> <output.csv>

import { BigQuery } from '@google-cloud/bigquery'
import { readFileSync, writeFileSync } from 'fs'

// Minimal, dependency-free RFC4180-ish CSV parser/writer -- avoids adding csv-parse/csv-stringify
// to this project's package.json for what's a one-off (repeatable-script) data task, not a
// dashboard feature. Handles quoted fields, embedded commas/newlines/escaped quotes -- the same
// shapes openpyxl's csv.writer produced when exporting the source Excel file.
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1]
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else { field += c }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\r' && next === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  const headers = rows[0]
  return rows.slice(1).filter(r => r.length > 1 || r[0] !== '').map(r => {
    const obj = {}
    headers.forEach((h, idx) => { obj[h] = r[idx] ?? '' })
    return obj
  })
}
function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}
function writeCsv(records, headers) {
  const lines = [headers.map(csvEscape).join(',')]
  for (const r of records) lines.push(headers.map(h => csvEscape(r[h])).join(','))
  return lines.join('\r\n')
}

const [, , INPUT, OUTPUT] = process.argv
if (!INPUT || !OUTPUT) {
  console.error('Usage: node scripts/resolve-incident-order-ids.mjs <input.csv> <output.csv>')
  process.exit(1)
}

const bq = new BigQuery({ keyFilename: 'sa_key.json', projectId: 'frido-429506' })
async function q(sql, params) {
  const [rows] = await bq.query({ query: sql, params, maximumBytesBilled: '30000000000' })
  return rows
}

// ---------------------------------------------------------------------------
// Step 1: extract a candidate order ID from the messy free-text field.
// ---------------------------------------------------------------------------
function extractOrderId(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s || /^(NA|N\/?A\.?|0)$/i.test(s)) return null

  // MF-prefixed Shopify order (the dominant case, ~96% of parseable values). Tolerates a typo'd
  // "MFO" (letter O instead of digit 0), stray '#'/whitespace/punctuation around it, and an
  // optional trailing "_EX###" reshipment suffix.
  let m = s.match(/M\s*F\s*O?\s*(\d{6,})(_EX\d+)?/i)
  if (m) {
    const digits = m[1]
    const exSuffix = m[2] ? m[2].toUpperCase().replace(/\s/g, '') : ''
    return `#MF${digits}${exSuffix}`
  }

  // Short #FM codes (a smaller but real bucket, e.g. offline/POS orders per earlier PnL work).
  m = s.match(/F\s*M\s*(\d{3,})/i)
  if (m) return `#FM${m[1]}`

  // Amazon order-number format (xxx-xxxxxxx-xxxxxxx) -- kept as-is, matched separately since it
  // isn't a Shopify OrderId at all; downstream matching just won't find it in the Shopify-style
  // fact table lookup and will correctly fall through to the email-based fallback.
  m = s.match(/(\d{3}-\d{7}-\d{7})/)
  if (m) return m[1]

  return null
}

// ---------------------------------------------------------------------------
// Load and parse the input CSV.
// ---------------------------------------------------------------------------
console.log('Reading', INPUT)
const csvText = readFileSync(INPUT, 'utf8')
const records = parseCsv(csvText)
console.log('Rows:', records.length)

records.forEach(r => {
  r.RefinedOrderId = extractOrderId(r['Order ID New'])
})

const withCandidate = records.filter(r => r.RefinedOrderId)
console.log('Rows with an extracted candidate order ID:', withCandidate.length)

// ---------------------------------------------------------------------------
// Step 2: match candidates against fact_all_platform_sales_report.OrderId (distinct check only
// -- confirms the ID is REAL, doesn't need order details yet, that's step 4).
// ---------------------------------------------------------------------------
const candidateIds = [...new Set(withCandidate.map(r => r.RefinedOrderId))]
console.log('Distinct candidate IDs to verify:', candidateIds.length)

const BATCH = 10000
const realOrderIds = new Set()
for (let i = 0; i < candidateIds.length; i += BATCH) {
  const batch = candidateIds.slice(i, i + BATCH)
  const rows = await q(
    `SELECT DISTINCT OrderId FROM \`frido-429506.production.fact_all_platform_sales_report\` WHERE OrderId IN UNNEST(@ids)`,
    { ids: batch }
  )
  rows.forEach(r => realOrderIds.add(r.OrderId))
  console.log(`Verified batch ${i}-${i + batch.length}: ${rows.length} real matches`)
}
console.log('Total distinct candidate IDs confirmed real:', realOrderIds.size)

records.forEach(r => {
  r._step2Matched = !!(r.RefinedOrderId && realOrderIds.has(r.RefinedOrderId))
})

// ---------------------------------------------------------------------------
// Step 3 (FALLBACK ONLY): for rows where step 2 did NOT match, look up the ticket's Email in
// fact_shopify_myfrido_mobility_all_orders and take that customer's most recent order_name.
// ---------------------------------------------------------------------------
const needsFallback = records.filter(r => !r._step2Matched && r['Email'] && r['Email'].trim())
const fallbackEmails = [...new Set(needsFallback.map(r => r['Email'].trim().toLowerCase()))]
console.log('Distinct emails needing fallback lookup:', fallbackEmails.length)

const latestOrderByEmail = new Map()
for (let i = 0; i < fallbackEmails.length; i += BATCH) {
  const batch = fallbackEmails.slice(i, i + BATCH)
  const rows = await q(`
    WITH ranked AS (
      SELECT LOWER(TRIM(customer_email)) AS email, order_name,
        ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(customer_email)) ORDER BY created_at_utc DESC) AS rn
      FROM \`frido-429506.production.fact_shopify_myfrido_mobility_all_orders\`
      WHERE LOWER(TRIM(customer_email)) IN UNNEST(@emails)
    )
    SELECT email, order_name FROM ranked WHERE rn = 1
  `, { emails: batch })
  rows.forEach(r => latestOrderByEmail.set(r.email, r.order_name))
  console.log(`Fallback batch ${i}-${i + batch.length}: ${rows.length} customers found`)
}
console.log('Total emails resolved to a latest order:', latestOrderByEmail.size)

records.forEach(r => {
  if (r._step2Matched) return // already resolved directly, don't overwrite
  const email = r['Email'] ? r['Email'].trim().toLowerCase() : null
  if (email && latestOrderByEmail.has(email)) {
    r.RefinedOrderId = latestOrderByEmail.get(email)
    r._resolvedVia = 'email_fallback'
  } else if (r._step2Matched === false && r.RefinedOrderId) {
    // Candidate existed but didn't match any real order, and no email fallback available either
    r.RefinedOrderId = null
  }
})
records.forEach(r => {
  if (r._step2Matched) r._resolvedVia = 'direct_order_id'
  else if (!r._resolvedVia) r._resolvedVia = 'unresolved'
})

const finalIds = [...new Set(records.filter(r => r.RefinedOrderId).map(r => r.RefinedOrderId))]
console.log('Final distinct RefinedOrderIds to join:', finalIds.length)
console.log('Resolution breakdown:', {
  direct: records.filter(r => r._resolvedVia === 'direct_order_id').length,
  emailFallback: records.filter(r => r._resolvedVia === 'email_fallback').length,
  unresolved: records.filter(r => r._resolvedVia === 'unresolved').length,
})

// ---------------------------------------------------------------------------
// Step 4: join fact_all_platform_sales_report + Clickpost (Forward only) + returns-exchange
// for the final order-detail fields, keyed by RefinedOrderId.
// ---------------------------------------------------------------------------
const orderDetails = new Map()
for (let i = 0; i < finalIds.length; i += BATCH) {
  const batch = finalIds.slice(i, i + BATCH)
  const rows = await q(`
    WITH sales AS (
      SELECT OrderId, ANY_VALUE(Order_Status) AS order_status, ANY_VALUE(OrderDate) AS order_date,
        ANY_VALUE(Dispatch_Date) AS dispatch_date, ANY_VALUE(Delivered_Date) AS delivered_date,
        ANY_VALUE(RefundStatus) AS refund_status_flag
      FROM \`frido-429506.production.fact_all_platform_sales_report\`
      WHERE OrderId IN UNNEST(@ids)
      GROUP BY OrderId
    ),
    cp AS (
      -- Forward shipments ONLY (2026-09-09 instruction) -- this is the order's own delivery
      -- leg, not its return/reverse leg.
      SELECT order_id, MIN(pickup_date) AS pickup_date, MIN(delivery_date) AS clickpost_delivery_date
      FROM \`frido-429506.production.Clickpost_Shipment_Tracking_Report\`
      WHERE shipment_type = 'Forward' AND order_id IN UNNEST(@ids)
      GROUP BY order_id
    ),
    refund AS (
      SELECT forward_order_id,
        MIN(refund_processed_on) AS refund_date,
        ANY_VALUE(refund_status) AS refund_status_detail
      FROM \`frido-429506.production.stg_clickpost_returns_exchange\`
      WHERE forward_order_id IN UNNEST(@ids)
      GROUP BY forward_order_id
    )
    SELECT sales.OrderId, order_status, order_date, dispatch_date, delivered_date, refund_status_flag,
      cp.pickup_date, cp.clickpost_delivery_date,
      refund.refund_date, refund.refund_status_detail
    FROM sales
    LEFT JOIN cp ON sales.OrderId = cp.order_id
    LEFT JOIN refund ON sales.OrderId = refund.forward_order_id
  `, { ids: batch })
  rows.forEach(r => orderDetails.set(r.OrderId, r))
  console.log(`Detail join batch ${i}-${i + batch.length}: ${rows.length} orders detailed`)
}
console.log('Total orders with detail found:', orderDetails.size)

// ---------------------------------------------------------------------------
// Merge details onto every ticket row and write the output CSV.
// ---------------------------------------------------------------------------
const DETAIL_FIELDS = ['order_status', 'order_date', 'dispatch_date', 'delivered_date', 'refund_status_flag', 'pickup_date', 'clickpost_delivery_date', 'refund_date', 'refund_status_detail']

records.forEach(r => {
  const d = r.RefinedOrderId ? orderDetails.get(r.RefinedOrderId) : null
  DETAIL_FIELDS.forEach(f => {
    let v = d ? d[f] : null
    if (v && typeof v === 'object' && 'value' in v) v = v.value
    r[`Refined_${f}`] = v ?? ''
  })
  delete r._step2Matched
})

const outHeaders = [...Object.keys(records[0])]
const csvOut = writeCsv(records, outHeaders)
writeFileSync(OUTPUT, csvOut)
console.log('Written to', OUTPUT)
