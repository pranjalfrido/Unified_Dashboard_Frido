// Data freshness: the latest day of a sales table can be incomplete until the sync finishes.
// A day D counts as fully synced only if the table was last updated after D ended (D+1 00:00 IST).
import { getBQ } from './bigquery.js';
import { datesTouched, istDates } from './dates.js';

const TTL_MS = 5 * 60 * 1000;
const IST_MS = 5.5 * 3600 * 1000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const cache = new Map(); // table -> { at, modified: Date }

async function lastModified(dataset, table) {
  const key = `${dataset}.${table}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.modified;
  const [meta] = await getBQ().dataset(dataset).table(table).getMetadata();
  const modified = meta.lastModifiedTime ? new Date(Number(meta.lastModifiedTime)) : null;
  cache.set(key, { at: Date.now(), modified });
  return modified;
}

function fmtIst(d) {
  const w = new Date(d.getTime() + IST_MS);
  return `${w.getUTCDate()} ${MON[w.getUTCMonth()]} ${w.toISOString().slice(11, 16)} IST`;
}

function dayLabel(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

// For one executed query: a note if the period it asked about includes a day the sync has not finished.
export async function freshnessNote(sql) {
  try {
    const found = [...String(sql).matchAll(/production\.([A-Za-z0-9_]+)/g)].map(x => x[1]);
    const tables = [...new Set(found)].filter(t => /fact_all_platform_sales_report|Clickpost_Shipment_Tracking_Report|Aggregated_uniware_sales_report/.test(t));
    if (!tables.length) return null;
    const touched = datesTouched(sql);
    if (!touched.length) return null;
    const lo = touched[0];
    const today = istDates().today;
    const hi = touched[touched.length - 1] < today ? touched[touched.length - 1] : today;
    for (const t of tables) {
      const modified = await lastModified('production', t);
      if (!modified) continue;
      const partial = [];
      for (let d = new Date(lo + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= hi && partial.length < 31; d = new Date(d.getTime() + 86400000)) {
        const dayEndUtc = new Date(d.getTime() + 86400000 - IST_MS);
        if (modified < dayEndUtc) partial.push(d.toISOString().slice(0, 10));
      }
      if (partial.length) {
        const days = partial.length === 1 ? dayLabel(partial[0]) : `${dayLabel(partial[0])}–${dayLabel(partial[partial.length - 1])}`;
        return `Note: data for ${days} is still syncing (last update ${fmtIst(modified)}); the number may rise.`;
      }
    }
  } catch { /* freshness is best-effort; never block an answer */ }
  return null;
}
