// CN Received tool: read-only SQL, same arithmetic as the page (src/cn/cnReceived.js), no injection through the month argument.
//   node scripts/test-cn-tool.mjs
import { CN_SQL, summarizeCn } from '../lib/cnTool.js';
let failed = 0;
const check = (n, ok) => { if (!ok) failed++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}`); };
const sql = CN_SQL('2026-09', '2026-09');
check('SQL is SELECT/UNION only (no write keyword)', !/\b(insert|update|delete|drop|alter|truncate|create|grant)\b/i.test(sql) && /^\s*SELECT/i.test(sql));
check('SQL reads only active rows', (sql.match(/is_active/g) || []).length === 4);
check('month filter is applied to every table', (sql.match(/>= '2026-09-01'::date/g) || []).length === 4);
check('no filter when no month', !/::date/.test(CN_SQL()));
const rows = [
  { category: 'B2C', reason: 'Weight Dispute', partner: 'Bluedart', month: '2026-09', n: 2, invoice: 1000, expected: 100, received: 80 },
  { category: 'B2C', reason: 'Lost/Damage', partner: 'Bluedart', month: '2026-09', n: 3, invoice: null, expected: 50, received: 50 },
  { category: 'FTL/PTL', reason: 'FTL/PTL', partner: 'Jopadevi', month: '2026-09', n: 1, invoice: 400, expected: 0, received: 0 },
  { category: '3PL', reason: '3PL', partner: 'Hexalog', month: '2026-08', n: 1, invoice: 200, expected: 20, received: 20 },
];
const s = summarizeCn(rows);
check('total count, invoice, received', s.total.n === 7 && s.total.invoice === 1600 && s.total.received === 150);
check('FTL/PTL and 3PL show as "Wrong billing"', s.reasons.some(r => r.reason === 'Wrong billing' && r.t.n === 2));
check('invoice stays null when no row has one', s.categories.find(c => c.key === 'B2C').t.invoice === 1000 && summarizeCn([rows[1]]).total.invoice === null);
check('partners ranked by received, then name', s.partners[0].partner === 'Bluedart' && s.partners[0].t.received === 130);
check('months oldest first', s.months[0].month === '2026-08');
process.exit(failed ? 1 : 0);
