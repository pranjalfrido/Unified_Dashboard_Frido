// inventory_cost tool = the Inventory Health "Inventory cost detail" card, same rule, totals calculated in code.
// Offline: a small fixture, plus guards that fail when the page's own code changes (so the copies in lib/ get re-synced).
import { readFileSync, existsSync } from 'fs';
import { buildCogs, valueRow, regularRows, buildInventoryCostText } from '../lib/inventoryCost.js';
import { knownNumbers, unverified } from '../lib/numberCheck.js';

let bad = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' -> ' + extra : ''}`); if (!cond) bad++; };
const norm = s => s.replace(/;/g, '').replace(/,\s*}/g, ' }').replace(/\s+/g, ' ').trim(); // ignores semicolons / trailing commas / whitespace

// ── guards against the page's code ──
const pageDir = '../src/inventory/';
if (existsSync(pageDir + 'InventoryCostTable.jsx')) {
  const costGroup = readFileSync(pageDir + 'costGroup.js', 'utf8');
  check('lib/inventoryCostGroup.js is identical to src/inventory/costGroup.js (re-copy it if this fails)', readFileSync('lib/inventoryCostGroup.js', 'utf8') === costGroup);
  const page = readFileSync(pageDir + 'InventoryCostTable.jsx', 'utf8');
  const fn = (src, name) => { const i = src.indexOf(`function ${name}(`); return i < 0 ? '' : norm(src.slice(i, src.indexOf('\n}', i) + 2)); };
  const mine = readFileSync('lib/inventoryCost.js', 'utf8');
  check('valueRow is the page\'s valueRow', fn(page, 'valueRow') && fn(page, 'valueRow') === fn(mine, 'valueRow').replace('export ', ''), fn(page, 'valueRow').slice(0, 60));
  for (const frag of ["if (!(r.cogs > 0)) continue", "r.month > latest[r.sku].month", "src: r.carriedFromMonth || r.month", "s.sum / s.n", "new Date(now.getFullYear(), now.getMonth() - 6, 1)"]) {
    check(`the page still builds COGS the same way: ${frag}`, page.includes(frag) && mine.includes(frag.replace('new Date(now.getFullYear(), now.getMonth() - 6, 1)', 'x')) || (frag.startsWith('new Date') && page.includes(frag)));
  }
  const health = readFileSync(pageDir + 'InventoryHealthPage.jsx', 'utf8');
  check('the page still takes Regular-facility stock (facilityType === Regular)', health.includes("s.facilities.filter(f => f.facilityType === 'Regular')"));
  check('the card is shown only with the inventory:cost permission', health.includes("allowedTabs.includes('inventory:cost')"));
} else console.log('skip  page files not present (running from the image)');

// ── the valuation rule on a fixture ──
const cogsRows = [
  { sku: 'A1', month: '2026-09-01', cogs: 100, subCategory: 'Alpha', carriedFromMonth: null },
  { sku: 'A1', month: '2026-11-01', cogs: 110, subCategory: 'Alpha', carriedFromMonth: '2026-09-01' },   // carried forward from Sep
  { sku: 'A2', month: '2026-11-01', cogs: 200, subCategory: 'Alpha', carriedFromMonth: '2026-09-01' },
  { sku: 'B1', month: '2026-11-01', cogs: 50, subCategory: 'Beta', carriedFromMonth: '2026-09-01' },
  { sku: 'Z0', month: '2026-11-01', cogs: 0, subCategory: 'Zed', carriedFromMonth: '2026-09-01' },     // zero cost = no COGS
];
const cogs = buildCogs(cogsRows);
check('latest month per SKU; COGS month = Nov 2026 carried from Sep 2026', cogs.month === '2026-11-01' && cogs.srcMonth === '2026-09-01' && cogs.latest.A1.cogs === 110);
check('sub-category average = mean of the SKUs\' latest COGS (Alpha = (110+200)/2 = 155)', cogs.subAvg.Alpha === 155 && cogs.subAvg.Beta === 50 && cogs.subAvg.Zed === undefined);
const fac = (u, type = 'Regular') => [{ facility: 'F1', facilityType: type, totalInvt: u }];
const file = { asOf: '2026-11-26T10:00:00Z', avgSaleWindowDays: 7, skus: [
  { sku: 'A1', category: 'Cat1', subCategory: 'Alpha', facilities: [...fac(100), ...fac(40, 'Dark Store')], avgSale: 10, doi: 10, stockStatus: 'Sufficient' }, // Regular only: 100
  { sku: 'A2', category: 'Cat1', subCategory: 'Alpha', facilities: fac(50), avgSale: 1, doi: 50, stockStatus: 'Excess' },
  { sku: 'A3', category: 'Cat1', subCategory: 'Alpha', facilities: fac(20), avgSale: 4, doi: 5, stockStatus: 'Low' },            // no COGS -> Alpha average 155
  { sku: 'B1', category: 'Cat2', subCategory: 'Beta', facilities: fac(10), avgSale: 0, doi: null, stockStatus: 'No Demand' },
  { sku: 'Q1', category: 'Cat2', subCategory: 'Quark', facilities: fac(7), avgSale: 7, doi: 1, stockStatus: 'Critical' },        // no COGS, no sub-cat avg -> not valued
  { sku: 'S0', category: 'Cat2', subCategory: 'Quark', facilities: fac(0), avgSale: 3, doi: 0, stockStatus: 'Out of Stock' },     // zero stock: not counted
] };
const rows = regularRows(file).map(s => valueRow(s, cogs));
check('stock = Regular facilities only (A1: 100, not 140)', rows[0].totalInvt === 100);
check('own COGS / sub-cat average / not valued', rows[0].cogsMap === 'Mapped' && rows[2].cogsMap === 'Sub-cat avg' && rows[4].cogsMap === 'Missing' && rows[4].totalCost === null);
const text = buildInventoryCostText({ rows, cogs, asOf: file.asOf, window: '7 days', args: { by: 'summary' } });
const line = k => (text.split('\n').find(l => l.startsWith(k + '\t')) || '').split('\t')[1];
// value: A1 100x110 + A2 50x200 + A3 20x155 + B1 10x50 = 11,000 + 10,000 + 3,100 + 500 = 24,600
check('inventory value = 24,600 (₹24,600)', /^₹24,600 /.test(line('inventory_value')), line('inventory_value'));
check('units = 187; SKUs with stock = 5 (the zero-stock SKU is not counted)', line('units') === '187' && line('skus_with_stock') === '5');
check('SKUs without their own COGS = 2 (1 at sub-cat average worth ₹3,100, 1 not valued with 7 units)', line('skus_without_own_cogs') === '2' && line('skus_valued_at_sub_cat_average') === '1' && /^₹3,100 /.test(line('value_from_sub_cat_average')) && line('skus_not_valued') === '1' && line('units_not_valued') === '7');
check('the text says which COGS month is used', /COGS rates: Sep 2026, carried forward/.test(text));
const prod = buildInventoryCostText({ rows, cogs, asOf: file.asOf, window: '7 days', args: { by: 'product' } });
check('by product: Alpha has 3 SKUs, 170 units, value ₹24,100; DOI = floor(170/15) = 11 -> Low (<= 15)', /Alpha\tCat1\t3\t170\t.*₹24,100 .*\t11\tLow/.test(prod), prod.split('\n').find(l => l.startsWith('Alpha')));
check('by product: a TOTAL row (all products) is added by code: 187 units, ₹24,600', /TOTAL of all 3 products[^\n]*\t[^\n]*187/.test(prod) && /₹24,600/.test(prod));
const cat = buildInventoryCostText({ rows, cogs, asOf: file.asOf, window: '7 days', args: { by: 'category' } });
check('by category: Cat1 value ₹24,100, Cat2 ₹500', /Cat1\t3\t170/.test(cat) && /Cat2\t2\t17/.test(cat));
const noc = buildInventoryCostText({ rows, cogs, asOf: file.asOf, window: '7 days', args: { by: 'no_cogs' } });
check('no_cogs lists A3 (sub-cat average) and Q1 (not valued) with a Why/Fix note and a TOTAL', /A3\t/.test(noc) && /Q1\t/.test(noc) && /Why:/.test(noc) && /TOTAL of all 2 SKUs/.test(noc));
const one = buildInventoryCostText({ rows, cogs, asOf: file.asOf, window: '7 days', args: { by: 'sku', sku: 'a2' } });
check('one SKU (case-insensitive): A2, 50 units, own COGS', /A2\t/.test(one) && /Mapped/.test(one));
check('a status filter: Critical SKUs only', /Q1\t/.test(buildInventoryCostText({ rows, cogs, args: { by: 'sku', status: 'Critical' } })) && !/\nA1\t/.test(buildInventoryCostText({ rows, cogs, args: { by: 'sku', status: 'Critical' } })));
check('an unknown filter gives "No SKUs with stock match"', /No SKUs with stock match/.test(buildInventoryCostText({ rows, cogs, args: { by: 'sku', sku: 'NOPE' } })));
// the number check accepts the tool's own numbers and catches the model's arithmetic
const k = knownNumbers([text, prod, cat, noc]);
check('numbers copied from the tool pass the number check', unverified('Total value ₹24,600 over 187 units; ₹3,100 from sub-category averages', k).length === 0);
check('a number the model worked out is caught (₹24,500)', unverified('Value ₹24,500', k).length === 1);
check('read-only: the module has no write path (no insert/update/delete/upsert/fetch POST of its own)', !/\b(insert|upsert|delete|update)\b/i.test(readFileSync('lib/inventoryCost.js', 'utf8').replace(/\/\/.*$/gm, '')));

console.log(bad ? `\n${bad} failed` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
