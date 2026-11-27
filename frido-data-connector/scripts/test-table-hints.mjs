// Table hints: key column per table, never-empty Total row, variants need no "which one" question, phone column choice.
import { keyColumns, fillTotals } from '../lib/tableHints.js';
import { buildCatalog, matchProducts, describeMatch, familiesOf } from '../lib/productMatch.js';
import { phoneColumns, withTotals } from '../../src/ask/phoneColumns.js';

let bad = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' -> ' + extra : ''}`); if (!cond) bad++; };

const ans = `**Inventory value: ₹2.70 Cr**

| Product | Category | SKUs with stock | Units | Avg sale | Inventory value | DOI |
|---|---|---|---|---|---|---|
| Cloud Comfort Arch Support Slippers | Footwear | 53 | 85,361 | 931 | ₹2.70 Cr | 91 |
| Arch Comfort Slipper Combo | Footwear | 5 | 1,000 | 10 | ₹30.00 L | 100 |
| **Total** | | | | | | |
`;
check('"value" question -> key column is the value column', keyColumns('Inventory value of arch comfort slipper', ans)[0] === 'Inventory value');
check('"inward" question -> units', keyColumns('Posture corrector inward this month', ans)[0] === 'Units');
check('"sales" question -> revenue', keyColumns('Cushion sales last month', '| Product | Units | Orders | Gross revenue |\n|---|---|---|---|\n| A | 1 | 2 | ₹3 |\n')[0] === 'Gross revenue');
check('no table -> no keys', keyColumns('x value', 'hello').length === 0);

const tool = 'metric\tvalue\nproduct\tcategory\tskus\tunits\tavg_sale\tinventory_value\tdoi\nA\tFootwear\t53\t85,361\t931\t₹2.70 Cr (raw 26963928)\t91\nB\tFootwear\t5\t1,000\t10\t₹30.00 L (raw 3000000)\t100\nTOTAL of all 2 products\t\t58\t86,361\t\t₹3.00 Cr (raw 29963928)\t';
const filled = fillTotals(ans, [tool], 'Inventory value of arch comfort slipper');
const tot = filled.split('\n').find(l => /Total/.test(l));
check('empty Total row filled from the tool TOTAL: units 86,361 and value ₹3.00 Cr', /86,361/.test(tot) && /₹3\.00 Cr/.test(tot), tot);
check('averages / DOI are never totalled (Avg sale and DOI stay empty)', tot.split('|').slice(1, -1).map(c => c.trim())[4] === '' && tot.split('|').slice(1, -1).map(c => c.trim())[6] === '');
const noTool = fillTotals('| Product | Units | Value |\n|---|---|---|\n| A | 1,000 | ₹1.00 L |\n| B | 2,500 | ₹2.50 L |\n| Total | | |\n', [], 'stock of x');
check('no tool total: the sum of the rows (3,500 and ₹3.50 L)', /3,500/.test(noTool) && /₹3\.50 L/.test(noTool), noTool.split('\n')[4]);
check('a top-N table is not summed by code', !/3,500/.test(fillTotals('| Product | Units |\n|---|---|\n| A | 1,000 |\n| B | 2,500 |\n| Total | |\n', [], 'top 2 products by units')));
check('a filled Total row is left alone', fillTotals('| P | Units |\n|---|---|\n| A | 1 |\n| B | 2 |\n| Total | 9 |\n', [], 'units') .includes('| Total | 9 |'));

// variants vs different products
const R = (sub, ...codes) => codes.map(c => ({ Product_Code: c, Name: c, Sub_category: sub, Category_Name: 'X' }));
const cat = buildCatalog([...R('Arch Comfort Slipper', 'S1'), ...R('Arch Comfort Slipper Combo', 'S2'), ...R('Arch Comfort Slipper Pro', 'S3'),
  ...R('Orthotics Posture Corrector', 'P1'), ...R('Orthotics Posture Corrector Pro', 'P2'), ...R('Orthotics Posture Corrector Seat', 'P3')]);
const m1 = matchProducts(cat, 'arch comfort slipper value');
check('variants / combos of one product: one family, no question', m1.mentions[0].kind === 'one' || (m1.mentions[0].distinct === false), JSON.stringify([m1.mentions[0].kind, m1.mentions[0].distinct]));
const m2 = matchProducts(cat, 'posture corrector inward');
check('posture corrector vs posture corrector seat: different products -> asks', m2.mentions[0].kind === 'several' && m2.mentions[0].distinct === true);
check('the block for different products says to ask; for variants it says not to', /Tell me which one you meant/.test(describeMatch(m2)) && (describeMatch(matchProducts(cat, 'slipper value')).includes('do NOT ask') || !/Tell me which one/.test(describeMatch(matchProducts(cat, 'slipper value')))));
check('familiesOf: Combo / Pro variants = 1 family; Seat = another', familiesOf([{ sub: 'Arch Comfort Slipper' }, { sub: 'Arch Comfort Slipper Combo' }, { sub: 'Arch Comfort Slipper Pro' }]) === 1 && familiesOf([{ sub: 'Orthotics Posture Corrector' }, { sub: 'Orthotics Posture Corrector Seat' }]) === 2);

// phone columns: the key column is always shown; text and SKU counts go first
const H = ['Product', 'Category', 'SKUs with stock', 'Units', 'Avg sale', 'Inventory value', 'DOI'];
const rows = [['A', 'Footwear', '53', '85,361', '931', '₹2.70 Cr', '91'], ['B', 'Footwear', '5', '1,000', '10', '₹30.00 L', '100'], ['Total', '', '58', '86,361', '', '', '']];
const num = H.map((_, j) => j > 0 && j !== 1);
const cols = phoneColumns(H, num, 'Inventory value');
check('phone shows name + value + at most 2 more numbers; Category and SKUs dropped', cols[0] === 0 && cols.includes(5) && !cols.includes(1) && !cols.includes(2) && cols.length <= 4, cols.join(','));
check('...the key column is there even when it is the 6th', cols.includes(5));
const ck = phoneColumns(H, num, null);
check('no hint from the connector: the phone still picks the value column by header', ck.includes(5));
const wt = withTotals(rows, H, num);
check('Total row gets 85,361+1,000 = 86,361 units and the value sum; Avg sale / DOI stay empty', wt[2][3] === '86,361' || /86,361/.test(wt[2][3]) , JSON.stringify(wt[2]));
check('value sum on the phone: ₹3.00 Cr', /₹3\.00 Cr/.test(wt[2][5]), wt[2][5]);
check('avg sale and DOI are not totalled on the phone', wt[2][4] === '—' && wt[2][6] === '—');

console.log(bad ? `\n${bad} failed` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
