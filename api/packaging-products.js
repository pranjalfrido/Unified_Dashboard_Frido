import { getBQ } from './_bq.js'

// Packaging BOM's product dropdown: distinct (Category, Sub_category) pairs, live from BigQuery
// item master — bypassing the Supabase-synced item_master table, which hit an unresolved RLS
// permission wall (confirmed 2026-09-30) even after granting a SELECT policy. Reading straight
// from frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master avoids that
// entirely, same source table as api/cogs-context.js's item_master CTE. "Packaging" category
// is excluded — its own SKUs are packaging components, not real products with their own BOM.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })
  try {
    const bq = getBQ()
    // detail=1 returns every real product SKU (Product_Code, Name, Category, Sub_category) —
    // used to build the packaging-SKU-to-product mapping (2026-09-30). Default (no detail flag)
    // stays the original distinct (category, sub_category) pairs used by the BOM page's product
    // dropdown, so that call site's shape doesn't change.
    const wantDetail = req.query?.detail === '1' || req.query?.detail === 'true'
    const sql = wantDetail ? `
      SELECT
        TRIM(Product_Code) AS product_code,
        TRIM(Name) AS name,
        CASE WHEN LOWER(TRIM(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE TRIM(Category_Name) END AS category,
        TRIM(Sub_category) AS sub_category
      FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
      WHERE Sub_category IS NOT NULL AND TRIM(Sub_category) != ''
        AND Category_Name IS NOT NULL AND TRIM(Category_Name) != ''
        AND LOWER(TRIM(Category_Name)) != 'packaging'
        AND Product_Code IS NOT NULL AND TRIM(Product_Code) != ''
      ORDER BY category, sub_category, product_code
    ` : `
      SELECT DISTINCT
        CASE WHEN LOWER(TRIM(Category_Name)) LIKE '%spare%' THEN 'Others' ELSE TRIM(Category_Name) END AS category,
        TRIM(Sub_category) AS sub_category
      FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\`
      WHERE Sub_category IS NOT NULL AND TRIM(Sub_category) != ''
        AND Category_Name IS NOT NULL AND TRIM(Category_Name) != ''
        AND LOWER(TRIM(Category_Name)) != 'packaging'
      ORDER BY category, sub_category
    `
    const [rows] = await bq.query({ query: sql })
    return res.status(200).json({ products: rows })
  } catch (e) {
    console.error('packaging-products error:', e)
    return res.status(500).json({ error: e.message ?? String(e) })
  }
}
