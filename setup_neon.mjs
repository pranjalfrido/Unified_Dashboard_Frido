import pkg from 'pg'
const { Pool } = pkg

const NEON_URL = 'postgresql://neondb_owner:npg_MgczWKFrBD19@ep-rapid-base-ah2axa3d-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

const pool = new Pool({ connectionString: NEON_URL, ssl: { rejectUnauthorized: false } })

console.log('Creating tables on Neon...')

await pool.query(`
  CREATE TABLE IF NOT EXISTS orders (
    order_id          TEXT,
    order_date        DATE,
    channel           TEXT,
    sub_channel       TEXT,
    channel_account   TEXT,
    country           TEXT,
    state             TEXT,
    city              TEXT,
    pincode           TEXT,
    product_id        TEXT,
    sku_code          TEXT,
    master_sku        TEXT,
    category          TEXT,
    sub_category      TEXT,
    item_qty          NUMERIC,
    revenue_inc_gst   NUMERIC,
    revenue_exc_gst   NUMERIC,
    tax               NUMERIC,
    gst_rate          TEXT,
    payment_mode      TEXT,
    customer_id       TEXT,
    voucher_code      TEXT,
    fulfilment_status TEXT,
    financial_status  TEXT,
    order_status      TEXT,
    is_rto            SMALLINT,
    is_cancelled      SMALLINT,
    is_cir_return     SMALLINT,
    is_exchange       SMALLINT,
    dispatch_date     TEXT,
    delivered_date    TEXT,
    synced_at         TIMESTAMPTZ DEFAULT NOW()
  )
`)
await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_date    ON orders (order_date)`)
await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders (channel)`)
await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id)`)

await pool.query(`
  CREATE TABLE IF NOT EXISTS sync_log (
    id            SERIAL PRIMARY KEY,
    sync_date     DATE,
    range_start   DATE,
    range_end     DATE,
    rows_synced   INT,
    rows_upserted INT,
    duration_s    NUMERIC,
    synced_at     TIMESTAMPTZ DEFAULT NOW()
  )
`)

const { rows } = await pool.query(`SELECT COUNT(*) AS total FROM orders`)
console.log('✅ Tables created! Orders count:', rows[0].total)
await pool.end()
