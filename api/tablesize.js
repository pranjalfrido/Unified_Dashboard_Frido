import { getBQ } from './_bq.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const bq = getBQ()

  const tables = [
    { dataset: 'production', table: 'fact_all_platform_sales_report' },
    { dataset: 'production', table: 'Clickpost_Shipment_Tracking_Report' },
    { dataset: 'production', table: 'Clickpost_Returns_Exchange_Report' },
    { dataset: 'production', table: 'Aggregated_uniware_sales_report' },
    { dataset: 'production', table: 'Unicommerce_GRN_Report' },
    { dataset: 'production', table: 'fact_shopify_inventory' },
    { dataset: 'production', table: 'fact_all_platform_ads_report' },
    { dataset: 'production', table: 'fact_shopify_myfrido_mobility_all_orders' },
    { dataset: 'Frido_BigQuery', table: 'Frido_Unicommerce_3_Inventory_Snapshot_Inventory_Snapshot' },
    { dataset: 'sharepoint_to_gcp', table: 'Frido_Item_Master__frido_item_sku_master' },
    { dataset: 'sharepoint_to_gcp', table: 'Frido_Item_Master__productid_sku_mapping' },
    { dataset: 'production', table: 'pincode_city_master' },
  ]

  const results = []
  for (const { dataset, table } of tables) {
    try {
      const [meta] = await bq.dataset(dataset).table(table).getMetadata()
      const bytes = parseInt(meta.numBytes || 0)
      const rows = parseInt(meta.numRows || 0)
      results.push({
        table,
        dataset,
        rows,
        bytes,
        mb: (bytes / 1024 / 1024).toFixed(1),
        gb: (bytes / 1024 / 1024 / 1024).toFixed(3),
      })
    } catch (e) {
      results.push({ table, dataset, error: e.message })
    }
  }

  res.json(results)
}
