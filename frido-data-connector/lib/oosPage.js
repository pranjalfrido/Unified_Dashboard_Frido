// Out-of-stock loss, exactly as the dashboard's Inventory Health > "OOS loss" page computes it.
// knowledge/oos_page.sql is a copy of api/data/inventory_oos.sql (synced by `npm run sync-knowledge`) and the
// per-day maths below is a verbatim copy of buildOos() in api/inventory-oos.js — keep both in sync with the page.
// The SQL is a script (DECLARE + temp functions), which the SELECT-only guard in lib/bigquery.js rejects, so it runs
// here as a vetted file: the text comes from our own repo, never from the model.
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBQ } from './bigquery.js';
import { formatRupees, indianInt } from './format.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL = readFileSync(path.join(here, '..', 'knowledge', 'oos_page.sql'), 'utf8');

const MIN_WINDOW_DAYS = 14;
const WINDOW_DAYS = 180;
const TTL = 60 * 60 * 1000;
const MAX_BYTES_BILLED = 5 * 1024 * 1024 * 1024; // same 5 GB cap as every other query
let cache = null;

function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function round(v, p) { const f = 10 ** p; return Math.round(v * f) / f; }

async function buildOos() {
  const [rows] = await getBQ().query({ query: SQL, location: 'asia-south1', maximumBytesBilled: String(MAX_BYTES_BILLED) });
  const skus = rows.map(r => {
    const longOk = r.window_days >= MIN_WINDOW_DAYS;
    const avg = longOk ? r.window_units / r.window_days : (r.units_180 || 0) / WINDOW_DAYS;
    const asp = r.asp == null ? null : Number(r.asp);
    const daysOos = Math.min(r.days_oos, WINDOW_DAYS);
    const dailyLoss = asp == null ? null : avg * asp;
    return {
      sku: r.sku, daysOos, neverInStock: r.stock_days_oos > WINDOW_DAYS, oosSource: r.oos_source,
      oosSince: r.oos_source === 'D2C sales stop' ? addDays(r.d2c_last_sale, 1) : r.last_in_stock ? addDays(r.last_in_stock, 1) : null,
      basis: longOk ? 'Longest in-stock run' : r.window_days ? `180-day avg (longest run only ${r.window_days} d)` : '180-day avg (no in-stock run)',
      windowStart: r.window_start || null, windowEnd: r.window_end || null,
      avgDailySale: round(avg, 2), asp,
      dailyLoss: dailyLoss == null ? null : Math.round(dailyLoss),
      lossToDate: dailyLoss == null ? null : Math.round(dailyLoss * daysOos),
      lossTillRestock: dailyLoss == null || !r.lead_time ? null : Math.round(dailyLoss * Number(r.lead_time)),
    };
  }).sort((a, b) => (b.lossToDate || 0) - (a.lossToDate || 0));
  return { asOf: rows[0]?.as_of || null, skus };
}

// Returns { text, skus } where text is the summary + a tab-separated table (SKU column enriched by the caller).
export async function runOosPage({ limit = 10, sku } = {}) {
  if (!cache || Date.now() - cache.at > TTL) cache = { at: Date.now(), payload: await buildOos() };
  const { asOf, skus } = cache.payload;
  // The page hides SKUs that were never in stock in the last 180 days; its count and loss total exclude them.
  const shown = skus.filter(s => !s.neverInStock);
  let list = shown;
  if (sku) {
    const want = String(sku).toUpperCase().replace(/[\s_]+/g, '');
    list = skus.filter(s => String(s.sku).toUpperCase().replace(/[\s_]+/g, '') === want);
    if (!list.length) return { text: `Source: Inventory Health > OOS loss page logic · as of ${asOf}\nSKU ${sku} is not out of stock on the latest snapshot or had no B2C sales in the last 180 days, so it is not on the OOS loss page.` };
  }
  const total = shown.reduce((s, r) => s + (r.lossToDate || 0), 0);
  const n = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const rows = list.slice(0, n);
  const head = `OOS loss page logic (Inventory Health > OOS loss) · as of ${asOf} · SKUs out of stock: ${indianInt(shown.length)} · total loss so far: ${formatRupees(total)} (raw ${total}) · top ${rows.length} by loss`;
  const cols = ['sku', 'days_oos', 'oos_since', 'oos_source', 'basis', 'avg_daily_sale', 'asp', 'daily_loss', 'loss_to_date', 'loss_till_restock'];
  const lines = rows.map(r => [r.sku, r.daysOos, r.oosSince || '', r.oosSource || '', r.basis, r.avgDailySale, r.asp ?? '', r.dailyLoss ?? '', r.lossToDate ?? '', r.lossTillRestock ?? ''].join('\t'));
  return { text: `${head}\n${cols.join('\t')}\n${lines.join('\n')}` };
}
