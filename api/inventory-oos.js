import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getBQ } from './_bq.js'

// Out-of-stock loss view (Inventory Health > "OOS loss"): every SKU out of stock today that sold
// in the last 180 days, with how long it has been out, what it sells per day while in stock, its
// ASP, and the sale it has lost. The SQL (api/data/inventory_oos.sql) does the heavy lifting -
// SKU resolution, daily stock from production.historical_inventory_till_date_UC, the longest
// in-stock run, B2C sales and ASP; this file adds the per-day maths and caches the result.
//
//   avg daily sale   B2C units in the SKU's longest unbroken in-stock run of the last 180 days /
//                    run length. Runs shorter than MIN_WINDOW_DAYS are too thin to trust (one
//                    sale on a one-day run reads as 1/day), so those - and SKUs with no in-stock
//                    run at all - use the 180-day B2C average instead. `basis` says which.
//   loss so far      days out of stock (capped at 180) x avg daily sale x ASP
//   daily loss       avg daily sale x ASP - what each further day out costs
//   loss till restock  daily loss x lead time - if a PO were raised today (item-master lead time)

const MIN_WINDOW_DAYS = 14
const WINDOW_DAYS = 180
const TTL = 60 * 60 * 1000
const SQL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'data', 'inventory_oos.sql'), 'utf8')

let cache = null   // { at, payload }

export async function buildOos() {
  const [rows] = await getBQ().query({ query: SQL, location: 'asia-south1' })
  const skus = rows.map(r => {
    const longOk = r.window_days >= MIN_WINDOW_DAYS
    const avg = longOk ? r.window_units / r.window_days : (r.units_180 || 0) / WINDOW_DAYS
    const asp = r.asp == null ? null : Number(r.asp)
    const daysOos = Math.min(r.days_oos, WINDOW_DAYS)
    const dailyLoss = asp == null ? null : avg * asp
    return {
      sku: r.sku, skuKey: r.sku_key, name: r.product_name || null,
      category: r.category, subCategory: r.sub_category, productSource: r.product_source || null,
      leadTime: r.lead_time == null ? null : Number(r.lead_time),
      // OOS since: the day after the last Shopify D2C sale when continuous D2C selling stopped,
      // else the day after the last in-stock snapshot (see the SQL header). Never-in-stock stays stock-based.
      daysOos, neverInStock: r.stock_days_oos > WINDOW_DAYS, oosSource: r.oos_source,
      oosSince: r.oos_source === 'D2C sales stop' ? addDays(r.d2c_last_sale, 1) : r.last_in_stock ? addDays(r.last_in_stock, 1) : null,
      lastInStock: r.last_in_stock || null, stockOosSince: r.last_in_stock ? addDays(r.last_in_stock, 1) : null,
      d2cLastSale: r.d2c_last_sale || null, d2cSaleDays30: r.d2c_sale_days_30 == null ? null : Number(r.d2c_sale_days_30),
      d2cStopAfterDays: r.d2c_stop_after_days == null ? null : Number(r.d2c_stop_after_days),
      basis: longOk ? 'Longest in-stock run' : r.window_days ? `180-day avg (longest run only ${r.window_days} d)` : '180-day avg (no in-stock run)',
      windowStart: r.window_start || null, windowEnd: r.window_end || null, windowDays: r.window_days || 0,
      windowUnits: Number(r.window_units || 0), units180: Number(r.units_180 || 0), inStockDays180: Number(r.in_stock_days_180 || 0),
      avgDailySale: round(avg, 2), asp, aspSource: r.asp_source || null,
      dailyLoss: dailyLoss == null ? null : Math.round(dailyLoss),
      lossToDate: dailyLoss == null ? null : Math.round(dailyLoss * daysOos),
      lossTillRestock: dailyLoss == null || !r.lead_time ? null : Math.round(dailyLoss * Number(r.lead_time)),
      lastSale: r.last_sale || null,
    }
  }).sort((a, b) => (b.lossToDate || 0) - (a.lossToDate || 0))
  return { asOf: rows[0]?.as_of || null, minWindowDays: MIN_WINDOW_DAYS, windowDays: WINDOW_DAYS, generatedAt: new Date().toISOString(), skus }
}

function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
function round(v, p) { const f = 10 ** p; return Math.round(v * f) / f }

export default async function handler(req, res) {
  try {
    const refresh = req.body?.refresh || req.query?.refresh
    if (!cache || refresh || Date.now() - cache.at > TTL) cache = { at: Date.now(), payload: await buildOos() }
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(cache.payload)
  } catch (e) {
    console.error('[inventory-oos]', e)
    res.status(500).json({ error: e.message })
  }
}
