import { getBQ, buildQuery } from './_bq.js'

// On-demand date×subcategory breakdown for the Category Revenue Matrix drill-down.
// Called only when the user clicks ▶ on a product row — never on page load.
// POST { start, end, channel } → { subCatDateMap: { cat: { sc: { date: { rev, excRev, units, cancelRev, rtoRev, cirRev, exchRev } } } } }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { start, end, channel } = req.body || {}
  if (!start || !end || !channel) return res.status(400).json({ error: 'start, end, channel required' })

  const CHANNEL_FILTER = {
    shopify:   `Channel='Shopify' AND SubChannel != 'Shopify International' AND SubChannel != 'Retail Store'`,
    ebo:       `Channel='Retail'`,
    amazon:    `SubChannel='Amazon Seller Central' AND COALESCE(Order_Status,'') != 'RTV (Return to vendor)'`,
    amazon_vc: `SubChannel='Amazon Vendor Central'`,
    flipkart:  `Channel='Flipkart'`,
    blinkit:   `Channel='Blinkit'`,
    instamart: `Channel='Instamart'`,
    zepto:     `Channel='Zepto'`,
    cred:      `Channel='CRED'`,
    firstcry:  `Channel='Firstcry'`,
    myntra:    `Channel='Myntra'`,
    offline:   `Channel='offline_sales'`,
  }

  const where = CHANNEL_FILTER[channel]
  if (!where) return res.status(400).json({ error: `Unknown channel: ${channel}` })

  const base = buildQuery(start, end, {})
  const sql = `WITH q AS (${base})
    SELECT
      CAST(OrderDate AS STRING) AS date,
      Category AS category,
      SubCategory AS subcategory,
      SUM(SellingPrice_Inc_GST) AS rev,
      SUM(SellingPrice_Exc_GST) AS exc_rev,
      SUM(ItemQty) AS units,
      SUM(CASE WHEN Order_Status='Cancelled' THEN SellingPrice_Inc_GST ELSE 0 END) AS cancel_rev,
      SUM(CASE WHEN Order_Status IN ('RTO','Return') THEN SellingPrice_Inc_GST ELSE 0 END) AS rto_rev,
      SUM(CASE WHEN Order_Status='CIR' THEN SellingPrice_Inc_GST ELSE 0 END) AS cir_rev,
      SUM(CASE WHEN Order_Status='Exchange' THEN SellingPrice_Inc_GST ELSE 0 END) AS exch_rev
    FROM q
    WHERE ${where} AND Category IS NOT NULL AND SubCategory IS NOT NULL
    GROUP BY date, category, subcategory
    ORDER BY date`

  try {
    const bq = getBQ()
    const [rows] = await bq.query({ query: sql })
    const subCatDateMap = {}
    rows.forEach(x => {
      const cat = x.category || 'Others'
      const sc = x.subcategory || 'Others'
      const date = x.date
      if (!subCatDateMap[cat]) subCatDateMap[cat] = {}
      if (!subCatDateMap[cat][sc]) subCatDateMap[cat][sc] = {}
      subCatDateMap[cat][sc][date] = {
        rev: parseFloat(x.rev) || 0,
        excRev: parseFloat(x.exc_rev) || 0,
        units: parseInt(x.units) || 0,
        cancelRev: parseFloat(x.cancel_rev) || 0,
        rtoRev: parseFloat(x.rto_rev) || 0,
        cirRev: parseFloat(x.cir_rev) || 0,
        exchRev: parseFloat(x.exch_rev) || 0,
      }
    })
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ subCatDateMap })
  } catch (e) {
    console.error('cat-daily error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
