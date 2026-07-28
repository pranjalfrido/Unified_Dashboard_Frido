import { BigQuery } from '@google-cloud/bigquery'
import pkg from 'pg'
const { Pool } = pkg

const bq = new BigQuery({ keyFilename: './sa_key.json', projectId: 'frido-429506' })
const pool = new Pool({
  connectionString: 'postgresql://postgres.dkvxaekxyqjjxcjoidqz:9564ZJPIfM7jB5mO@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false },
  max: 3,
})

async function bulkLoad(db, tableName, rows, cols, params, batchSize = 500) {
  await db.query(`TRUNCATE ${tableName}`)
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const n = cols.length
    const values = batch.map((_, j) => `(${cols.map((_, k) => `$${j*n+k+1}`).join(',')})`).join(',')
    const flat = batch.flatMap(params)
    await db.query(`INSERT INTO ${tableName} VALUES ${values} ON CONFLICT DO NOTHING`, flat)
    console.log(`  ${tableName}: ${Math.min(i+batchSize, rows.length)}/${rows.length}`)
  }
  console.log(`${tableName} loaded ✅`)
}

async function run() {
  const db = await pool.connect()
  try {
    console.log('Creating tables...')
    await db.query(`
      CREATE TABLE IF NOT EXISTS item_master (
        product_code TEXT PRIMARY KEY,
        category_name TEXT, sub_category TEXT, lead_time TEXT,
        product_source TEXT, sku_first_sales_date TEXT, type TEXT
      )`)
    await db.query(`
      CREATE TABLE IF NOT EXISTS sku_mapping (
        productid TEXT PRIMARY KEY, masterskucode TEXT
      )`)
    await db.query(`
      CREATE TABLE IF NOT EXISTS inv_snapshot (
        item_sku_code TEXT, facility TEXT, updated TIMESTAMPTZ, inventory FLOAT, inventory_blocked FLOAT,
        PRIMARY KEY (item_sku_code, facility)
      )`)
    await db.query(`
      CREATE TABLE IF NOT EXISTS sales_window (
        id SERIAL PRIMARY KEY,
        final_sku TEXT, facility TEXT, state TEXT, channel TEXT, order_date DATE, qty FLOAT
      )`)
    await db.query(`
      CREATE TABLE IF NOT EXISTS sales_90d (
        final_sku TEXT PRIMARY KEY, last_sale_date DATE, qty_90d FLOAT
      )`)
    await db.query(`
      CREATE TABLE IF NOT EXISTS shopify_inv (
        sku TEXT PRIMARY KEY, available FLOAT
      )`)
    console.log('Tables created ✅')

    // Fetch all from BQ in parallel
    console.log('Fetching from BQ in parallel...')
    const [
      [itemRows], [skuRows], [invRows], [salesRows], [last90Rows], [shopifyRows]
    ] = await Promise.all([
      bq.query({ query: `SELECT Product_Code, Category_Name, Sub_category, Lead_Time, Product_Source, SKU_First_Sales_Date, Type FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master\` WHERE Type IS NULL OR UPPER(TRIM(Type)) != 'BUNDLE'` }),
      bq.query({ query: `SELECT DISTINCT TRIM(productid) AS productid, TRIM(masterskucode) AS masterskucode FROM \`frido-429506.sharepoint_to_gcp.Frido_Item_Master__productid_sku_mapping\` WHERE TRIM(masterskucode) NOT IN ('', 'not found')` }),
      bq.query({ query: `SELECT ItemSkuCode, Facility, Updated, Inventory, InventoryBlocked FROM \`frido-429506.production.unicommerce_inventory_snapshot_hourly\`` }),
      bq.query({ query: `SELECT final_sku, Facility, state, channel, order_date, qty FROM \`frido-429506.production.inventory_sales_window\`` }),
      bq.query({ query: `SELECT final_sku, last_sale_date, qty_90d FROM \`frido-429506.production.inventory_sales_90d\`` }),
      bq.query({ query: `SELECT sku, available FROM \`frido-429506.production.inventory_shopify_hourly\`` }),
    ])
    console.log(`Fetched: item_master=${itemRows.length}, sku_mapping=${skuRows.length}, inv_snapshot=${invRows.length}, sales_window=${salesRows.length}, sales_90d=${last90Rows.length}, shopify=${shopifyRows.length}`)

    await bulkLoad(db, 'item_master', itemRows, ['a','b','c','d','e','f','g'],
      r => [r.Product_Code||null, r.Category_Name||null, r.Sub_category||null, String(r.Lead_Time??''), r.Product_Source||null, r.SKU_First_Sales_Date||null, r.Type||null])

    await bulkLoad(db, 'sku_mapping', skuRows, ['a','b'],
      r => [r.productid||null, r.masterskucode||null])

    await bulkLoad(db, 'inv_snapshot', invRows, ['a','b','c','d','e'],
      r => [r.ItemSkuCode||null, r.Facility||null, r.Updated?.value||r.Updated||null, r.Inventory??null, r.InventoryBlocked??null], 1000)

    await db.query('TRUNCATE sales_window RESTART IDENTITY')
    for (let i = 0; i < salesRows.length; i += 1000) {
      const batch = salesRows.slice(i, i + 1000)
      const values = batch.map((_, j) => `($${j*5+1},$${j*5+2},$${j*5+3},$${j*5+4},$${j*5+5})`).join(',')
      const flat = batch.flatMap(r => [r.final_sku||null, r.Facility||null, r.state||null, r.channel||null, r.order_date?.value||r.order_date||null])
      await db.query(`INSERT INTO sales_window(final_sku,facility,state,channel,order_date) VALUES ${values}`, flat)
      console.log(`  sales_window: ${Math.min(i+1000, salesRows.length)}/${salesRows.length}`)
    }
    // qty column — add separately since it was omitted above; redo properly:
    await db.query('TRUNCATE sales_window RESTART IDENTITY')
    for (let i = 0; i < salesRows.length; i += 1000) {
      const batch = salesRows.slice(i, i + 1000)
      const values = batch.map((_, j) => `($${j*6+1},$${j*6+2},$${j*6+3},$${j*6+4},$${j*6+5},$${j*6+6})`).join(',')
      const flat = batch.flatMap(r => [r.final_sku||null, r.Facility||null, r.state||null, r.channel||null, r.order_date?.value||r.order_date||null, r.qty??null])
      await db.query(`INSERT INTO sales_window(final_sku,facility,state,channel,order_date,qty) VALUES ${values}`, flat)
      console.log(`  sales_window: ${Math.min(i+1000, salesRows.length)}/${salesRows.length}`)
    }
    console.log('sales_window loaded ✅')

    await bulkLoad(db, 'sales_90d', last90Rows, ['a','b','c'],
      r => [r.final_sku||null, r.last_sale_date?.value||r.last_sale_date||null, r.qty_90d??null])

    await bulkLoad(db, 'shopify_inv', shopifyRows, ['a','b'],
      r => [r.sku||null, r.available??null])

    console.log('\n✅ All done!')
  } finally {
    db.release()
    await pool.end()
  }
}

run().catch(e => { console.error('❌ Error:', e.message); process.exit(1) })
