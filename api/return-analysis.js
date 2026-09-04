import { getBQ, buildQuery, netRevenueSelectFragment, computeNetRevenueMeasures } from './_bq.js'

// D2C – Return Analysis. Dedicated endpoint (mirrors api/returns.js's single-purpose style)
// rather than growing api/bq.js further. Reuses buildQuery/netRevenueSelectFragment/
// computeNetRevenueMeasures from _bq.js so every % here reconciles with the D2C Overview tab's
// own Cancel/RTO/CIR/Exchange/Return% cards (same formula, same base table/filters).

const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000
const CACHE_VERSION = 1

function getCacheKey(body) {
  const { start, end, category, subCategory, subChannel, paymentType, topProductsPaymentType } = body
  return JSON.stringify({ v: CACHE_VERSION, start, end, category, subCategory, subChannel, paymentType, topProductsPaymentType })
}
function getFromCache(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null }
  return entry.data
}
function setInCache(key, data) {
  if (cache.size >= 200) { const oldest = cache.keys().next().value; cache.delete(oldest) }
  cache.set(key, { data, ts: Date.now() })
}

// D2C = Channel='Shopify', excluding the Retail Store sub-channel (EBO), same convention as
// api/bq.js's shTotals/shReturnReasons queries. subChannel filter (MyFrido/Mobility) layers on
// top of that, mirroring buildQuery()'s own subChannel handling.
function shopifyBase(start, end, filters) {
  const base = buildQuery(start, end, { ...filters, channelGroup: undefined })
  return base
}

function shopifyWhere(filters) {
  const clauses = [`Channel = 'Shopify'`, `SubChannel != 'Retail Store'`]
  if (filters.subChannel === 'MyFrido' || filters.subChannel === 'Mobility') clauses.push(`SubChannel = '${filters.subChannel}'`)
  else clauses.push(`SubChannel != 'Shopify International'`)
  return clauses.join(' AND ')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // `category`/`subCategory` scope the whole page (page-level filter, same convention as every
  // other tab). `paymentType` (section 4's own dropdown) and `topProductsPaymentType` (section
  // 3's own dropdown) are two independent filters — each scopes only its own widget.
  const { start, end, category, subCategory, subChannel, paymentType, topProductsPaymentType } = req.body
  if (!start || !end) return res.status(400).json({ error: 'Missing start or end' })

  const cacheKey = getCacheKey(req.body)
  const cached = getFromCache(cacheKey)
  if (cached) { res.setHeader('X-Cache', 'HIT'); return res.json(cached) }

  try {
    const bq = getBQ()
    const filters = { category, subCategory, subChannel }
    const base = shopifyBase(start, end, filters)
    const shWhere = shopifyWhere(filters)

    // Previous period, same length, immediately before `start` — for KPI trend badges.
    const startD = new Date(start), endD = new Date(end)
    const nDaysRange = Math.round((endD - startD) / 86400000) + 1
    const prevEndD = new Date(startD); prevEndD.setDate(prevEndD.getDate() - 1)
    const prevStartD = new Date(prevEndD); prevStartD.setDate(prevStartD.getDate() - nDaysRange + 1)
    const ps = prevStartD.toISOString().slice(0, 10), pe = prevEndD.toISOString().slice(0, 10)
    const prevBase = shopifyBase(ps, pe, filters)

    // Last 12 complete calendar months up to `end`'s month (inclusive of the current, possibly
    // partial, month — matches how the rest of the dashboard treats the selected range). Built
    // with UTC getters/setters throughout (Date.UTC + getUTC*/setUTC*) — endD was parsed from a
    // plain 'YYYY-MM-DD' string, which the Date constructor always treats as UTC midnight per
    // spec; mixing that with LOCAL getters/setters (getMonth/new Date(y,m,d)) silently shifted
    // the computed start date back a day under any timezone behind UTC (confirmed under IST,
    // UTC+5:30 — `new Date(y, m, 1).toISOString()` rolled 2025-08-01 back to 2025-07-31), which
    // clipped the first month's date range and made its revenue look implausibly low.
    const endMonthStartUTC = Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth(), 1)
    const twelveMoStartD = new Date(endMonthStartUTC)
    twelveMoStartD.setUTCMonth(twelveMoStartD.getUTCMonth() - 11)
    const twelveMoStartStr = twelveMoStartD.toISOString().slice(0, 10)
    const twelveMoBase = buildQuery(twelveMoStartStr, end, { subChannel })

    const catPaymentTypeClause = paymentType ? ` AND PaymentMode = '${paymentType.replace(/'/g, "''")}'` : ''
    const topProductsPaymentTypeClause = topProductsPaymentType ? ` AND PaymentMode = '${topProductsPaymentType.replace(/'/g, "''")}'` : ''

    const queries = {
      // KPI totals — current + previous period, D2C-scoped. Never filtered by either widget's
      // own payment-type dropdown — those scope only their own section.
      kpiCurrent: `WITH q AS (${base}) SELECT ${netRevenueSelectFragment('q')} FROM q WHERE ${shWhere}`,
      kpiPrev: `WITH q AS (${prevBase}) SELECT ${netRevenueSelectFragment('q')} FROM q WHERE ${shWhere}`,

      // Daily trend — per-day Cancel/RTO/CIR/Exchange/Return % (client aggregates to weekly/monthly).
      // Only the revenue-basis %s are actually charted (ReturnTrendChart has no qty toggle), but
      // qty fields are included so withPct() below never silently divides by a zero qty.
      dailyTrend: `WITH q AS (${base})
        SELECT CAST(OrderDate AS STRING) AS date, ${netRevenueSelectFragment('q')},
          SUM(ItemQty) AS qty,
          SUM(CASE WHEN Order_Status = 'CIR' THEN ItemQty ELSE 0 END) AS cir_qty,
          SUM(CASE WHEN Order_Status = 'RTO' THEN ItemQty ELSE 0 END) AS rto_qty,
          SUM(CASE WHEN Order_Status = 'Return' THEN ItemQty ELSE 0 END) AS return_qty,
          SUM(CASE WHEN Order_Status = 'Cancelled' THEN ItemQty ELSE 0 END) AS cancel_qty,
          SUM(CASE WHEN Order_Status = 'Exchange' THEN ItemQty ELSE 0 END) AS exch_qty
        FROM q WHERE ${shWhere}
        GROUP BY date ORDER BY date`,

      // Category / Sub-category breakdown, qty AND revenue basis together. `paymentType` was
      // this widget's own dropdown (section 4) — removed from the UI, but left wired here (a
      // no-op filter without a frontend control) in case a future revision brings it back.
      byCategorySubCategory: `WITH q AS (${base})
        SELECT Category AS category, SubCategory AS sub_category,
          ${netRevenueSelectFragment('q')},
          SUM(ItemQty) AS qty,
          SUM(CASE WHEN Order_Status = 'CIR' THEN ItemQty ELSE 0 END) AS cir_qty,
          SUM(CASE WHEN Order_Status = 'RTO' THEN ItemQty ELSE 0 END) AS rto_qty,
          SUM(CASE WHEN Order_Status = 'Return' THEN ItemQty ELSE 0 END) AS return_qty,
          SUM(CASE WHEN Order_Status = 'Cancelled' THEN ItemQty ELSE 0 END) AS cancel_qty,
          SUM(CASE WHEN Order_Status = 'Exchange' THEN ItemQty ELSE 0 END) AS exch_qty
        FROM q WHERE ${shWhere}${catPaymentTypeClause}
        GROUP BY category, sub_category`,

      // SKU/variant-level breakdown within each Category+SubCategory — powers the category
      // table's expand-to-variants row (e.g. "Posture Corrector" expands to its S/M/L/XL SKUs).
      // Same metric set as byCategorySubCategory, one extra grouping level.
      bySkuVariant: `WITH q AS (${base})
        SELECT Category AS category, SubCategory AS sub_category, MasterSKU AS sku,
          ${netRevenueSelectFragment('q')},
          SUM(ItemQty) AS qty,
          SUM(CASE WHEN Order_Status = 'CIR' THEN ItemQty ELSE 0 END) AS cir_qty,
          SUM(CASE WHEN Order_Status = 'RTO' THEN ItemQty ELSE 0 END) AS rto_qty,
          SUM(CASE WHEN Order_Status = 'Return' THEN ItemQty ELSE 0 END) AS return_qty,
          SUM(CASE WHEN Order_Status = 'Cancelled' THEN ItemQty ELSE 0 END) AS cancel_qty,
          SUM(CASE WHEN Order_Status = 'Exchange' THEN ItemQty ELSE 0 END) AS exch_qty
        FROM q WHERE ${shWhere}${catPaymentTypeClause} AND MasterSKU IS NOT NULL AND TRIM(MasterSKU) != ''
        GROUP BY category, sub_category, sku`,

      // Last 12 calendar months, same metric set.
      byMonth: `WITH q AS (${twelveMoBase})
        SELECT FORMAT_DATE('%Y-%m', DATE(OrderDate)) AS month,
          ${netRevenueSelectFragment('q')},
          SUM(ItemQty) AS qty,
          SUM(CASE WHEN Order_Status = 'CIR' THEN ItemQty ELSE 0 END) AS cir_qty,
          SUM(CASE WHEN Order_Status = 'RTO' THEN ItemQty ELSE 0 END) AS rto_qty,
          SUM(CASE WHEN Order_Status = 'Return' THEN ItemQty ELSE 0 END) AS return_qty,
          SUM(CASE WHEN Order_Status = 'Cancelled' THEN ItemQty ELSE 0 END) AS cancel_qty,
          SUM(CASE WHEN Order_Status = 'Exchange' THEN ItemQty ELSE 0 END) AS exch_qty
        FROM q WHERE ${shopifyWhere({ subChannel })}
        GROUP BY month ORDER BY month`,

      // Payment-type breakdown — scoped by the page-level category/subCategory filter, same as
      // every other section (its own dedicated slicer was removed from the UI).
      byPaymentType: `WITH q AS (${base})
        SELECT COALESCE(NULLIF(TRIM(PaymentMode), ''), 'Unknown') AS payment_type,
          ${netRevenueSelectFragment('q')},
          SUM(ItemQty) AS qty,
          SUM(CASE WHEN Order_Status = 'CIR' THEN ItemQty ELSE 0 END) AS cir_qty,
          SUM(CASE WHEN Order_Status = 'RTO' THEN ItemQty ELSE 0 END) AS rto_qty,
          SUM(CASE WHEN Order_Status = 'Return' THEN ItemQty ELSE 0 END) AS return_qty,
          SUM(CASE WHEN Order_Status = 'Cancelled' THEN ItemQty ELSE 0 END) AS cancel_qty,
          SUM(CASE WHEN Order_Status = 'Exchange' THEN ItemQty ELSE 0 END) AS exch_qty
        FROM q WHERE ${shWhere}
        GROUP BY payment_type`,

      // Top products by revenue lost to returns (RTO+CIR+Return+Exchange+Cancel revenue), CLUBBED
      // by Category+SubCategory rather than by individual SKU — a sub-category like "Posture
      // Corrector" has multiple size/color SKU variants, and grouping by MasterSKU alone produced
      // several near-duplicate rows all labeled with the same sub-category name. Grouping by
      // Category+SubCategory sums returns across all its variants into one row.
      // `topProductsPaymentType` is this widget's own dropdown (section 3).
      byProductReturns: `WITH q AS (${base})
        SELECT Category AS category, SubCategory AS sub_category,
          SUM(SellingPrice_Inc_GST) AS gross_rev,
          SUM(CASE WHEN Order_Status IN ('RTO','CIR','Return','Cancelled') THEN SellingPrice_Inc_GST ELSE 0 END) AS lost_rev,
          SUM(CASE WHEN Order_Status IN ('RTO','CIR','Return','Cancelled') THEN ItemQty ELSE 0 END) AS lost_qty
        FROM q WHERE ${shWhere}${topProductsPaymentTypeClause}
        GROUP BY category, sub_category
        HAVING lost_rev > 0
        ORDER BY lost_rev DESC`,

      // Return reasons breakdown — Customer_Return_Reason/Customer_Sub_Reason live on the raw
      // fact table but aren't projected through buildQuery()'s `q` CTE, so (same as api/bq.js's
      // shReturnReasons) this queries the raw table directly rather than `WITH q AS (${base})`.
      returnReasons: `SELECT COALESCE(NULLIF(TRIM(Customer_Return_Reason), ''), 'Unknown') AS reason,
          COALESCE(NULLIF(TRIM(Customer_Sub_Reason), ''), 'Unknown') AS sub_reason,
          COUNT(DISTINCT OrderId) AS count,
          SUM(SellingPrice_Inc_GST) AS revenue_impact
        FROM \`frido-429506.production.fact_all_platform_sales_report\`
        WHERE OrderDate BETWEEN '${start}' AND '${end}' AND ${shWhere}
          AND Order_Status IN ('RTO', 'Return', 'CIR')
          AND Customer_Return_Reason IS NOT NULL AND TRIM(Customer_Return_Reason) != ''
        GROUP BY reason, sub_reason ORDER BY count DESC`,

      // Cancellation by month + day-bucket + category/sub-category — fixed last 6 calendar months
      // from today (ignores the page date range picker intentionally — this chart is always "last 6
      // months from now" so the numbers don't shift when the user changes the date filter).
      cancelByBucket: (() => {
        const today = new Date()
        const sixMonthsAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1))
        const sixStart = sixMonthsAgo.toISOString().slice(0, 10)
        const sixEnd = today.toISOString().slice(0, 10)
        return `SELECT
          FORMAT_DATE('%b %Y', OrderDate) AS month,
          DATE_TRUNC(OrderDate, MONTH) AS month_dt,
          COALESCE(NULLIF(TRIM(Category), ''), 'Others') AS category,
          COALESCE(NULLIF(TRIM(SubCategory), ''), 'Others') AS sub_category,
          CASE
            WHEN DATE_DIFF(DATE(Cancelled_At), OrderDate, DAY) BETWEEN 0 AND 1 THEN '0-1'
            WHEN DATE_DIFF(DATE(Cancelled_At), OrderDate, DAY) BETWEEN 2 AND 4 THEN '2-4'
            WHEN DATE_DIFF(DATE(Cancelled_At), OrderDate, DAY) BETWEEN 5 AND 7 THEN '5-7'
            WHEN DATE_DIFF(DATE(Cancelled_At), OrderDate, DAY) BETWEEN 8 AND 10 THEN '8-10'
            ELSE '10+'
          END AS bucket,
          COUNT(DISTINCT OrderId) AS cancel_count
        FROM \`frido-429506.production.fact_all_platform_sales_report\`
        WHERE OrderDate BETWEEN '${sixStart}' AND '${sixEnd}' AND ${shWhere}
          AND Order_Status = 'Cancelled'
          AND Cancelled_At IS NOT NULL
        GROUP BY month, month_dt, category, sub_category, bucket
        ORDER BY month_dt, category, sub_category, bucket`
      })(),
    }

    const entries = Object.entries(queries)
    const results = {}
    // Bounded concurrency, same reasoning as api/_bq.js's runQueriesLimited (avoid tripping
    // BigQuery's per-user rate limit by firing 9 queries all at once).
    const CONCURRENCY = 6
    let nextIdx = 0
    async function worker() {
      while (true) {
        const i = nextIdx++
        if (i >= entries.length) return
        const [key, sql] = entries[i]
        const [rows] = await bq.query({ query: sql, maximumBytesBilled: '10000000000' })
        results[key] = rows
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker))

    const kpiCur = computeNetRevenueMeasures(results.kpiCurrent?.[0] || {})
    const kpiPrev = computeNetRevenueMeasures(results.kpiPrev?.[0] || {})

    const withPct = row => {
      const m = computeNetRevenueMeasures(row)
      const qty = parseFloat(row.qty) || 0
      const cirQty = parseFloat(row.cir_qty) || 0
      const rtoQty = parseFloat(row.rto_qty) || 0
      const returnQty = parseFloat(row.return_qty) || 0
      const cancelQty = parseFloat(row.cancel_qty) || 0
      const exchQty = parseFloat(row.exch_qty) || 0
      const totalReturnQty = cirQty + rtoQty + returnQty + cancelQty
      return {
        revenue: m.grossIncGst,
        qty,
        cancelPct: m.cancelPct * 100,
        rtoPct: m.rtoPct * 100,
        cirPct: m.cirPct * 100,
        exchangePct: m.exchPct * 100,
        totalReturnPct: m.totalReturnPct * 100,
        cancelPctQty: qty > 0 ? (cancelQty / qty * 100) : 0,
        rtoPctQty: qty > 0 ? ((rtoQty + returnQty) / qty * 100) : 0,
        cirPctQty: qty > 0 ? (cirQty / qty * 100) : 0,
        exchangePctQty: qty > 0 ? (exchQty / qty * 100) : 0,
        totalReturnPctQty: qty > 0 ? (totalReturnQty / qty * 100) : 0,
        cancelRev: m.cancelRev, rtoRev: m.rtoRev + m.returnRev, cirRev: m.cirRev, exchangeRev: m.exchRev,
      }
    }

    const payload = {
      kpis: {
        totalRevenue: kpiCur.grossIncGst,
        prevTotalRevenue: kpiPrev.grossIncGst,
        returnPct: kpiCur.totalReturnPct * 100,
        prevReturnPct: kpiPrev.totalReturnPct * 100,
        cancelPct: kpiCur.cancelPct * 100, prevCancelPct: kpiPrev.cancelPct * 100, cancelRev: kpiCur.cancelRev,
        rtoPct: kpiCur.rtoPct * 100, prevRtoPct: kpiPrev.rtoPct * 100, rtoRev: kpiCur.rtoRev + kpiCur.returnRev,
        cirPct: kpiCur.cirPct * 100, prevCirPct: kpiPrev.cirPct * 100, cirRev: kpiCur.cirRev,
        exchangePct: kpiCur.exchPct * 100, prevExchangePct: kpiPrev.exchPct * 100, exchangeRev: kpiCur.exchRev,
      },
      dailyTrend: (results.dailyTrend || []).map(r => ({ date: r.date, ...withPct(r) })),
      topProducts: (results.byProductReturns || []).map(r => ({
        category: r.category || 'Others', subCategory: r.sub_category || 'Others',
        grossRev: parseFloat(r.gross_rev) || 0,
        returnRevLost: parseFloat(r.lost_rev) || 0,
        returnQtyLost: parseFloat(r.lost_qty) || 0,
        returnPct: parseFloat(r.gross_rev) > 0 ? (parseFloat(r.lost_rev) / parseFloat(r.gross_rev) * 100) : 0,
      })),
      categoryTable: (results.byCategorySubCategory || []).map(r => ({ category: r.category || 'Others', subCategory: r.sub_category || 'Others', ...withPct(r) })),
      // Keyed 'Category::SubCategory' so the frontend can expand a category row to its SKU
      // variants without a second round trip.
      skuVariants: (results.bySkuVariant || []).reduce((acc, r) => {
        const key = `${r.category || 'Others'}::${r.sub_category || 'Others'}`
        if (!acc[key]) acc[key] = []
        acc[key].push({ sku: r.sku, ...withPct(r) })
        return acc
      }, {}),
      monthlyTable: (results.byMonth || []).map(r => ({ month: r.month, ...withPct(r) })),
      paymentTypeTable: (results.byPaymentType || []).map(r => ({ paymentType: r.payment_type, ...withPct(r) })),
      returnReasons: (results.returnReasons || []).map(r => ({ reason: r.reason, subReason: r.sub_reason, count: parseInt(r.count) || 0, revenueImpact: parseFloat(r.revenue_impact) || 0 })),
      cancelByBucket: (results.cancelByBucket || []).map(r => ({ month: r.month, monthDt: r.month_dt?.value || r.month_dt, category: r.category, subCategory: r.sub_category, bucket: r.bucket, cancelCount: parseInt(r.cancel_count) || 0 })),
    }

    setInCache(cacheKey, payload)
    res.setHeader('X-Cache', 'MISS')
    res.json(payload)
  } catch (e) {
    console.error('[return-analysis]', e.message)
    res.status(500).json({ error: e.message })
  }
}
