// Number check: every number in an answer must come from the tool results (formatting allowed), never from the model's arithmetic.
import { knownNumbers, unverified, replaceTables, tsvToMarkdown } from '../lib/numberCheck.js';
let bad = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' -> ' + extra : ''}`); if (!cond) bad++; };
const tool = ['sub\tunits\tgrns\nOrthotics Posture Corrector\t35271\t26\nOrthotics Posture Corrector Pro\t23,066\t28\nTOTAL\t66,074\t69',
  'gross ₹5.13 L (raw 513000)\nrevenue ₹1.23 Cr (raw 12330000)\nreturn 8.7% (raw 0.087)\nshare 1,53,451\nrate 2,36,450.5'];
const k = knownNumbers(tool);
const u = t => unverified(t, k);
check('a number that is in the results passes (66,074)', u('Total 66,074 units').length === 0);
check('the model\'s own wrong total fails (65,074)', JSON.stringify(u('Total 65,074 units')) === '["65,074"]');
check('plain digits, Indian commas and K formatting all match', u('18290').length === 1 && u('66074 units / 66.07K / 66,074').length === 0);
check('₹ amounts: ₹5.13 L matches raw 513000; ₹1.23 Cr matches raw 12330000', u('₹5.13 L and ₹1.23 Cr').length === 0);
check('₹5.14 L (a rounding slip) fails', u('₹5.14 L').length === 1);
check('lakh amount written in full matches', u('₹5,13,000').length === 0);
check('percentage 8.7% matches the raw fraction 0.087; 9.7% fails', u('8.7%').length === 0 && u('9.7%').length === 1);
check('Indian grouping 1,53,451 matches', u('1,53,451').length === 0);
check('small whole numbers, dates and years are not checked', u('3 SKUs, 1–26 Nov 2026, 25 Nov, top 10, FR-OPC-L1, 35x40x8, Q4').length === 0);
check('a 4-digit number that is not a year is checked', u('2,397 units').length === 1);
check('a computed ratio is flagged (1.17 not in results)', u('ratio 1.17').length === 1);
check('negative numbers match their absolute value', u('-66,074').length === 0);
check('answer with a table: only the wrong cell is reported', JSON.stringify(u('| A | 35,271 |\n| B | 23,066 |\n| Total | 65,074 |')) === '["65,074"]');

const table = '| P | Units |\n|---|---|\n| X | 1 |';
const rep = replaceTables('Intro line\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nNote after', table);
check('replaceTables swaps the model table for the computed one and keeps the text', /Intro line/.test(rep) && /Note after/.test(rep) && rep.includes('| X | 1 |') && !rep.includes('| a | b |'));
check('replaceTables adds the table when the answer had none', replaceTables('Just text', table).endsWith(table));
const md = tsvToMarkdown('sku\tunits\nA\t5 (raw 5)\nB\t6');
check('tsvToMarkdown renders the connector result as a markdown table', md.startsWith('| sku | units |') && md.includes('| A | 5 |'));
console.log(bad ? `\n${bad} failed` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
