// Product metrics are calculated in code (lib/productMetric.js): totals, breakdown rows, % and vs-previous never come from the model.
// Offline: fake page data shaped like /api/inward and the Sales category query.
import { readFileSync, existsSync } from 'fs';
import { detectMetric, parsePeriod, computeProductMetric } from '../lib/productMetric.js';
import { SALES_CATEGORY_SQL } from '../lib/salesCategorySql.js';
import { buildCatalog, matchProducts } from '../lib/productMatch.js';
import { knownNumbers, unverified } from '../lib/numberCheck.js';

let bad = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' -> ' + extra : ''}`); if (!cond) bad++; };
const TODAY = '2026-11-26';

check('inward words -> inward; sales words -> sales; both or none -> model', detectMetric('Posture corrector inward this month') === 'inward' && detectMetric('Cushion sales last month') === 'sales' && detectMetric('inward and sales of cushion') === null && detectMetric('what is a cushion') === null);
const p = t => parsePeriod(t, TODAY);
check('this month = 1st to today (IST)', p('x this month').start === '2026-11-01' && p('x this month').end === TODAY);
check('last month = the whole previous month', p('sales last month').start === '2026-10-01' && p('sales last month').end === '2026-10-31' && p('sales last month').label === 'Oct 2026');
check('a named month and year', p('CN Sep 2026').start === '2026-09-01' && p('CN Sep 2026').end === '2026-09-30');
check('January as "last month" in January goes to December of the year before', parsePeriod('sales last month', '2027-01-10').start === '2026-12-01');
check('no period words -> no calculation', p('sandals inward') === null);

const R = (sub, cat, ...codes) => codes.map(c => ({ Product_Code: c, Name: c, Sub_category: sub, Category_Name: cat }));
const catalog = buildCatalog([
  ...R('Orthotics Posture Corrector', 'Orthotics', 'FR-OPC-S1', 'FR-OPC-M1', 'FR-OPC-L1'),
  ...R('Orthotics Posture Corrector Pro', 'Orthotics', 'FR-OPPC-M1', 'FR-OPPC-L1'),
  ...R('Orthotics Posture Corrector Seat', 'Orthotics', 'FR-OPCS-W1'),
  ...R('Ultimate Pro Posture Corrector', 'Orthotics', 'FR-UPPC-G'),
  ...Array.from({ length: 12 }, (_, i) => R(`Alpha Cushion ${String.fromCharCode(65 + i)}`, 'Mobility', `FR-AC${i}`)).flat(),
]);

// fake /api/inward: units per SKU, GRNs per call
const skuRows = [
  ['FR-OPC-S1', 'Orthotics Posture Corrector', 2715], ['FR-OPC-M1', 'Orthotics Posture Corrector', 14266], ['FR-OPC-L1', 'Orthotics Posture Corrector', 18290],
  ['FR-OPPC-M1', 'Orthotics Posture Corrector Pro', 11500], ['FR-OPPC-L1', 'Orthotics Posture Corrector Pro', 11566],
  ['FR-OPCS-W1', 'Orthotics Posture Corrector Seat', 5340], ['FR-UPPC-G', 'Ultimate Pro Posture Corrector', 2397],
].map(([sku, sc, units]) => ({ sku, subCategory: sc, units, rejected: 0, grns: 1 }));
const grnsBySub = { 'Orthotics Posture Corrector': 26, 'Orthotics Posture Corrector Pro': 28, 'Orthotics Posture Corrector Seat': 1, 'Ultimate Pro Posture Corrector': 14 };
let calls = [];
const deps = {
  inward: async body => {
    calls.push(body);
    const subs = body.subCategory, sku = body.sku;
    const rows = skuRows.filter(r => (sku ? r.sku === sku : subs.includes(r.subCategory)));
    const units = rows.reduce((a, r) => a + r.units, 0);
    const grns = sku ? 17 : subs.length === 1 ? grnsBySub[subs[0]] : 69; // all four together: 69 distinct GRNs (not 26+28+1+14)
    return { kpis: { cur: { units, grns, rejected: 0, skus: rows.length }, prev: { units: Math.round(units * 0.8) } }, skus: rows };
  },
  salesRows: async () => Array.from({ length: 12 }, (_, i) => ({ sub_category: `Alpha Cushion ${String.fromCharCode(65 + i)}`, platform: 'Amazon', orders: 100 + i, units: 1000 - i * 10, gross_revenue: 1_000_000 + i * 50_000 }))
    .concat(Array.from({ length: 12 }, (_, i) => ({ sub_category: `Alpha Cushion ${String.fromCharCode(65 + i)}`, platform: 'Shopify', orders: 50, units: 100, gross_revenue: 200_000 }))),
};

const q = 'Posture corrector inward this month';
const r = await computeProductMetric(q, matchProducts(catalog, q), deps, TODAY);
check('posture corrector inward: total 66,074 units, 69 GRNs (distinct, not the sum of the products\' GRNs)', r && r.total.units === 66074 && r.total.grns === 69, r && JSON.stringify(r.total));
check('...one row per matched product and a Total row', r && /\| Orthotics Posture Corrector \| 35,271 \| 26 \|/.test(r.text) && /\| \*\*Total\*\* \| \*\*66,074\*\* \| \*\*69\*\* \|/.test(r.text));
check('...vs previous period % is calculated here (▲ 25.0%)', r && /Previous equal period: 52,859 units \(▲ 25\.0%\)/.test(r.text), r && r.text.split('\n').find(l => l.startsWith('Previous')));
check('...ends with "Tell me which one you meant."', r && /Tell me which one you meant\.$/.test(r.text));
const again = await computeProductMetric(q, matchProducts(catalog, q), deps, TODAY);
check('same question, same computed text every time', again.text === r.text);
const k = knownNumbers([r.text]);
check('every number in the computed text is "known" to the number check', unverified(r.text, k).length === 0, unverified(r.text, k).join(','));
check('a model-made total (65,074) would be caught against it', unverified('Total 65,074 units', k).length === 1);

const sku = 'FR-OPC-L1 inward this month';
const rs = await computeProductMetric(sku, matchProducts(catalog, sku), deps, TODAY);
check('a SKU question: 18,290 units, 17 GRNs, one headline, no "which one"', rs && rs.total.units === 18290 && /18,290 units inward/.test(rs.text) && !/which one/.test(rs.text), rs && rs.text.split('\n')[0]);
const one = 'Orthotics Posture Corrector inward this month';
const ro = await computeProductMetric(one, matchProducts(catalog, one), deps, TODAY);
check('one clear product: 35,271 units, 26 GRNs, named in the first line with its SKU count', ro && ro.total.units === 35271 && ro.total.grns === 26 && /Orthotics Posture Corrector, 3 SKUs/.test(ro.text.split('\n')[0]));

const sq = 'Cushion sales last month';
const rsales = await computeProductMetric(sq, matchProducts(catalog, sq), deps, TODAY);
const expectUnits = Array.from({ length: 12 }, (_, i) => 1000 - i * 10 + 100).reduce((a, b) => a + b, 0);
check('sales: totals are the sum over all channels and all 12 products', rsales && rsales.total.units === expectUnits && rsales.total.products === 12, rsales && JSON.stringify(rsales.total));
check('sales: top 10 + "Other 2 products" + Total, revenue in ₹ Cr/L', rsales && /Other 2 products/.test(rsales.text) && /\*\*Total\*\*/.test(rsales.text) && /₹[\d.]+ (Cr|L)/.test(rsales.text));
check('no period words -> null (the model handles it)', (await computeProductMetric('cushion sales', matchProducts(catalog, 'cushion sales'), deps, TODAY)) === null);
check('two products in one question -> null (the model handles it)', (await computeProductMetric('posture corrector and cushion sales last month', matchProducts(catalog, 'posture corrector and cushion sales last month'), deps, TODAY)) === null);
check('failing data source -> null, not a crash', (await computeProductMetric(q, matchProducts(catalog, q), { inward: async () => { throw new Error('down'); } }, TODAY)) === null);

// the copied Sales SQL must equal the page's
const page = '../api/bq.js';
if (existsSync(page)) {
  const line = readFileSync(page, 'utf8').split('\n').find(l => l.trim().startsWith('salesCategoryOrders:'));
  const lit = line.slice(line.indexOf('`'), line.lastIndexOf('`') + 1);
  const sql = new Function('start', 'end', 'return ' + lit)('__START__', '__END__');
  check('lib/salesCategorySql.js is identical to the Sales page query in api/bq.js', sql === SALES_CATEGORY_SQL);
} else console.log('skip  api/bq.js not present (running from the image)');

console.log(bad ? `\n${bad} failed` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
