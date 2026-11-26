// `inventory_cost` tool: Inventory Health → "Inventory cost detail" card (permission inventory:cost), read-only.
// Same inputs and same rule as the card (src/inventory/InventoryCostTable.jsx), nothing re-invented:
//   stock   = the Regular-facility stock per SKU from the Inventory Health file inv-data-7d (the page's default "Regular" view)
//   COGS    = POST /api/cogs-monthly (product_cogs_monthly), each SKU's LATEST month with a cost; the month shown is the month the
//             rates were uploaded for ("Sep 2026, carried forward" while Oct/Nov reuse September)
//   value   = own COGS x units; else the average COGS of the SKU's sub-category x units; else NOT valued (Missing)
//   counts  = SKUs with stock > 0 only (what the phone card shows; the laptop table also lists zero-stock rows)
//   product = all SKUs with the same sub-category name; DOI = floor(units / avg sale); status bands Critical <=2, Low <=15, Sufficient <=45, else Excess
// Every total, subtotal and count is calculated here. The valuation helpers are copies of the page's code, guarded by
// scripts/test-inventory-cost.mjs, which fails when the page's code changes.
import { groupProducts, totalsOf, statusFor, hasStock, byValue, cogsRateLabel } from './inventoryCostGroup.js';
import { formatTsv, indianInt, formatRupees } from './format.js';

const pad = n => String(n).padStart(2, '0');
const monthStart = (y, m) => `${y}-${pad(m)}-01`;

// The page's loadLatestCogs reducer (InventoryCostTable.jsx): latest month with a positive cost per SKU and per sub-category.
export function buildCogs(rows) {
  const latest = {};
  for (const r of rows || []) {
    if (!(r.cogs > 0)) continue;
    if (!latest[r.sku] || r.month > latest[r.sku].month) latest[r.sku] = { month: r.month, cogs: r.cogs, subCategory: r.subCategory, src: r.carriedFromMonth || r.month };
  }
  const sums = {};
  for (const v of Object.values(latest)) {
    if (!v.subCategory) continue;
    const s = (sums[v.subCategory] ||= { sum: 0, n: 0 });
    s.sum += v.cogs; s.n += 1;
  }
  const subAvg = {};
  for (const [k, s] of Object.entries(sums)) subAvg[k] = s.sum / s.n;
  const month = Object.values(latest).reduce((m, v) => (v.month > m ? v.month : m), '');
  const bySrc = {};
  for (const v of Object.values(latest)) bySrc[v.src] = (bySrc[v.src] || 0) + 1;
  const srcMonth = Object.entries(bySrc).sort((a, b) => b[1] - a[1])[0]?.[0] || month;
  return { latest, subAvg, month, srcMonth };
}

// The page's valueRow: one SKU valued at cost: own COGS, else the sub-category average, else not valued.
export function valueRow(s, cogs) {
  const own = cogs.latest[s.sku];
  const avg = cogs.subAvg[s.subCategory];
  const unit = own ? own.cogs : avg != null ? avg : null;
  return { ...s, cogs: unit, cogsMap: own ? 'Mapped' : avg != null ? 'Sub-cat avg' : 'Missing', totalCost: unit != null ? unit * (s.totalInvt || 0) : null };
}

// The page's regularSkus (InventoryHealthPage.jsx), with no slicer: stock = sum of the SKU's Regular facilities.
export function regularRows(file) {
  return (file?.skus || []).map(s => {
    if (Array.isArray(s.facilities) && s.facilities.length > 0) {
      const reg = s.facilities.filter(f => f.facilityType === 'Regular');
      return { ...s, totalInvt: reg.reduce((a, f) => a + (f.totalInvt || 0), 0) };
    }
    return { ...s, totalInvt: (s.locations || []).reduce((a, l) => a + (l.totalInvt || 0), 0) };
  });
}

const money = formatRupees, int = indianInt;
const lakh = n => `${(n / 1e5).toFixed(2)} L`;

// rows = valued rows (valueRow applied to regularRows). Returns the text the model gets.
export function buildInventoryCostText({ rows, cogs, asOf, window: win, args = {} }) {
  const by = String(args.by || 'summary');
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
  const label = cogsRateLabel(cogs);
  const stock = rows.filter(hasStock);
  const q = s => String(s || '').trim().toLowerCase();
  let list = stock;
  if (args.category) list = list.filter(r => q(r.category) === q(args.category));
  if (args.product) list = list.filter(r => q(r.subCategory) === q(args.product));
  if (args.sku) list = list.filter(r => q(r.sku) === q(args.sku));
  const head = [
    'inventory_cost (Inventory Health → Inventory cost detail card, Regular facilities, SKUs with stock > 0)',
    `${label.text}${label.carried ? ' (the newer months have no COGS sheet yet; the older rates are reused)' : ''}`,
    `Stock: Inventory Health file (avg-sale window ${win || '7 days'}), as of ${asOf || 'n/a'}.`,
    'Rule: SKU value = own COGS x units; if the SKU has no COGS, the average COGS of its sub-category x units; if neither, the stock is NOT valued (Missing).',
  ];
  if (!list.length) return `${head.join('\n')}\nNo SKUs with stock match this filter.`;
  const t = totalsOf(list);
  const out = [...head];

  if (by === 'summary') {
    const own = list.filter(r => r.cogsMap === 'Mapped');
    const avg = list.filter(r => r.cogsMap === 'Sub-cat avg');
    const miss = list.filter(r => r.cogsMap === 'Missing');
    const products = groupProducts(list).length;
    out.push('', 'metric\tvalue',
      `inventory_value\t${money(t.value)} (raw ${Math.round(t.value)})`,
      `units\t${int(t.units)}`,
      `skus_with_stock\t${int(list.length)}`,
      `products\t${int(products)}`,
      `skus_own_cogs\t${int(own.length)}`,
      `skus_valued_at_sub_cat_average\t${int(avg.length)}`,
      `value_from_sub_cat_average\t${money(t.avgValue)} (raw ${Math.round(t.avgValue)})`,
      `skus_without_own_cogs\t${int(avg.length + miss.length)}`,
      `skus_not_valued\t${int(miss.length)}`,
      `units_not_valued\t${int(t.missingUnits)}`);
    out.push('', `Of the ${int(avg.length + miss.length)} SKUs without their own COGS, ${int(avg.length)} are valued at the sub-category average (${money(t.avgValue)} of the total) and ${int(miss.length)} are not valued at all (${int(t.missingUnits)} units, counted as ₹0).`);
    return out.join('\n');
  }

  if (by === 'no_cogs') {
    const noOwn = list.filter(r => r.cogsMap !== 'Mapped');
    const sorted = [...noOwn].sort((a, b) => (b.totalInvt || 0) - (a.totalInvt || 0) || a.sku.localeCompare(b.sku));
    const avg = noOwn.filter(r => r.cogsMap === 'Sub-cat avg'), miss = noOwn.filter(r => r.cogsMap === 'Missing');
    const tsv = ['sku\tproduct\tcategory\tunits\tinventory_value\tcogs_basis', ...sorted.slice(0, limit).map(r => `${r.sku}\t${r.subCategory || ''}\t${r.category || ''}\t${r.totalInvt}\t${r.totalCost == null ? 'NULL' : r.totalCost}\t${r.cogsMap}`)].join('\n');
    out.push('', `SKUs with stock but no COGS of their own: ${int(noOwn.length)} (${int(avg.length)} valued at the sub-category average, ${int(miss.length)} not valued). Top ${Math.min(limit, noOwn.length)} by units:`);
    out.push(formatTsv(tsv, null, { totals: { units: noOwn.reduce((a, r) => a + (r.totalInvt || 0), 0), inventory_value: noOwn.reduce((a, r) => a + (r.totalCost || 0), 0) }, totalLabel: `TOTAL of all ${int(noOwn.length)} SKUs without their own COGS (calculated by the connector)` }));
    out.push('Why: the SKU is in the stock file but has no row with a cost in product_cogs_monthly (new SKU, or the COGS sheet has no line for it). Fix: add the SKU to the COGS sheet (COGS page); sub-category-average SKUs get their own COGS the same way.');
    return out.join('\n');
  }

  const sortKey = { value: 'value', units: 'units', doi: 'doi', avgsale: 'avgSale', sale: 'avgSale' }[q(args.sortBy)] || 'value';
  const cmp = (a, b, k, dir = -1) => dir * ((a[k] ?? -1) - (b[k] ?? -1)) || String(a.name).localeCompare(String(b.name));
  const present = (name, category, o) => ({ name, category, skus: o.skus ?? o.variants?.length, units: o.units, avgSale: o.avgSale, value: o.value, doi: o.doi, status: o.status });
  let entries;
  if (by === 'product') {
    entries = groupProducts(list).map(p => present(p.name, p.category, { ...p, skus: p.variants.length }));
  } else if (by === 'category') {
    const g = new Map();
    for (const r of list) { const k = r.category || 'Uncategorised'; const e = g.get(k) || { rows: [], units: 0, avgSale: 0, value: 0 }; e.rows.push(r); e.units += r.totalInvt || 0; e.avgSale += r.avgSale || 0; e.value += r.totalCost || 0; g.set(k, e); }
    entries = [...g].map(([name, e]) => { const doi = e.avgSale > 0 ? Math.floor(e.units / e.avgSale) : null; return present(name, name, { skus: e.rows.length, units: e.units, avgSale: e.avgSale, value: e.value, doi, status: statusFor(doi, e.avgSale, e.units) }); });
  } else if (by === 'sku') {
    entries = [...list].map(r => ({ name: r.sku, category: r.subCategory || '', skus: 1, units: r.totalInvt || 0, avgSale: r.avgSale || 0, value: r.totalCost, doi: r.doi, status: r.stockStatus, basis: r.cogsMap, cogs: r.cogs }));
  } else {
    return `${head.join('\n')}\nUnknown "by" value. Use summary, product, sku, category or no_cogs.`;
  }
  if (args.status) entries = entries.filter(e => q(e.status) === q(args.status));
  entries.sort((a, b) => cmp(a, b, sortKey));
  const shown = entries.slice(0, limit);
  const totUnits = entries.reduce((a, e) => a + (e.units || 0), 0), totValue = entries.reduce((a, e) => a + (e.value || 0), 0);
  const nameHead = by === 'product' ? 'product\tcategory' : by === 'category' ? 'category' : 'sku\tproduct';
  const rowsTsv = shown.map(e => {
    const lead = by === 'category' ? e.name : by === 'product' ? `${e.name}\t${e.category}` : `${e.name}\t${e.category}`;
    const tail = `${e.skus}\t${e.units}\t${Math.round((e.avgSale || 0) * 10) / 10}\t${e.value == null ? 'NULL' : e.value}\t${e.doi == null ? 'NULL' : e.doi}\t${e.status}`;
    return by === 'sku' ? `${lead}\t${tail}\t${e.basis}` : `${lead}\t${tail}`;
  });
  const header = `${nameHead}\tskus\tunits\tavg_sale\tinventory_value\tdoi\tstatus${by === 'sku' ? '\tcogs_basis' : ''}`;
  out.push('', `${entries.length} ${by === 'category' ? 'categories' : by === 'product' ? 'products' : 'SKUs'}${args.status ? ` with status ${args.status}` : ''}; top ${shown.length} by ${sortKey === 'value' ? 'inventory value' : sortKey}:`);
  out.push(formatTsv([header, ...rowsTsv].join('\n'), null, { totals: { units: totUnits, inventory_value: totValue, skus: entries.reduce((a, e) => a + (e.skus || 0), 0) }, totalLabel: `TOTAL of all ${int(entries.length)} ${by === 'category' ? 'categories' : by === 'product' ? 'products' : 'SKUs'} (calculated by the connector)` }));
  out.push(`DOI = floor(units / avg sale); status bands: Critical ≤ 2 days, Low ≤ 15, Sufficient ≤ 45, else Excess (No Demand when avg sale is 0). Total units ${lakh(totUnits)} (${int(totUnits)}).`);
  return out.join('\n');
}

// Live data (the page's own sources): inv-data-7d file + /api/cogs-monthly.
export async function runInventoryCost(args, deps, now = Date.now()) {
  const ist = new Date(now + 5.5 * 3600e3);
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth() + 1;
  const back = new Date(Date.UTC(y, m - 1 - 6, 1));
  const body = { startMonth: monthStart(back.getUTCFullYear(), back.getUTCMonth() + 1), endMonth: monthStart(y, m) };
  const [file, cogsResp] = await Promise.all([deps.invFile('inv-data-7d'), deps.cogsMonthly(body)]);
  const cogs = buildCogs(cogsResp?.rows);
  const rows = regularRows(file).map(s => valueRow(s, cogs));
  return { text: buildInventoryCostText({ rows, cogs, asOf: file?.asOf, window: `${file?.avgSaleWindowDays || 7} days`, args }), rows, cogs };
}
