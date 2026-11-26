// Canary check for product questions: each question 5 times, all 5 must show the page's numbers and the same numbers.
//   node --env-file=.env scripts/pulse-product-runs.mjs <baseUrl> [out.json]
// Order (to save credits): 1 run of each question first; if any of those is wrong the script stops. Then the other 4 runs, then 5 older
// test-set questions once each. The key is read from CONNECTOR_API_KEY and never printed. Expected numbers are as of 26 Nov 2026
// (inward "this month" changes as the month goes on; the sales questions are October 2026).
import { writeFileSync } from 'fs';

const [base, out = 'product-runs.json'] = process.argv.slice(2);
const key = process.env.CONNECTOR_API_KEY;
if (!base || !key) { console.error('usage: node --env-file=.env scripts/pulse-product-runs.mjs <baseUrl> [out.json]'); process.exit(1); }
const ACCESS = { isAdmin: true, tabs: [] };

const PRODUCT = [
  { q: 'Posture corrector inward this month', expect: ['66,074'], note: 'Inward page, 4 products' },
  { q: 'Cushion sales last month', expect: ['43,188', '29,671'], note: 'Sales category table, Oct 2026' },
  { q: 'Knee cap inward this month', expect: ['16,245'], note: 'Inward page, 3 products' },
  { q: 'Sandals sales last month', expect: ['38,685', '37,842'], note: 'Sales category table, Oct 2026' },
  { q: 'FR-OPC-L1 inward this month', expect: ['18,290'], note: 'Inward page, SKU' },
];
const OLDER = [
  { q: 'What was D2C gross revenue from 1 to 28 Oct 2026?', expect: ['30.52 Cr'], note: 'test set #1' },
  { q: 'What was D2C net revenue from 1 to 28 Oct 2026?', expect: ['21.90 Cr'], note: 'test set #2' },
  { q: 'Top 5 D2C categories by gross revenue, 1–28 Oct 2026', expect: ['8.15 Cr', '6.71 Cr', '4.03 Cr'], note: 'test set #6' },
  { q: 'Compare Delhivery vs Bluedart delivery rate, Sep 2026', expect: ['90.7', '86.8'], note: 'test set #25 (Sep delivery rates; value from live = canary, page file covers Nov only)' },
  { q: 'CN received by reason for Sep 2026', expect: ['2.48 L', '93,837'], note: 'test set #97' },
];

async function ask(q) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${base}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key }, body: JSON.stringify({ messages: [{ role: 'user', content: q }], access: ACCESS }), signal: AbortSignal.timeout(290000) });
    const body = await r.json().catch(() => ({}));
    return { status: r.status, text: String(body.text || body.error || ''), seconds: Math.round((Date.now() - t0) / 100) / 10 };
  } catch (e) { return { status: 0, text: String(e.message), seconds: 0 }; }
}
// numbers of 1,000 or more (formatted or plain), for comparing runs with each other
const nums = t => [...new Set([...String(t).replace(/₹\s?/g, '').matchAll(/(?<![\w.])\d{1,3}(?:,\d{2,3})+(?![\d,])|(?<![\w.,])\d{4,}(?![\d,])/g)].map(m => m[0]).filter(n => !/^(19|20)\d\d$/.test(n)))].sort();
const hasAll = (text, expect) => expect.every(e => text.includes(e));
const results = [];

async function runSet(set, times, label) {
  for (const item of set) {
    item.runs = item.runs || [];
    for (let i = item.runs.length; i < times; i++) {
      const r = await ask(item.q);
      r.ok = r.status === 200 && hasAll(r.text, item.expect);
      r.nums = nums(r.text);
      item.runs.push(r);
      console.log(`${label} | ${item.q} | run ${item.runs.length} | ${r.status} ${r.seconds}s | expected ${item.expect.join(' + ')}: ${r.ok ? 'YES' : 'NO'} | numbers: ${r.nums.slice(0, 8).join(' ')}`);
      if (i === 0 && !r.ok && label === 'product') { console.log('\nFirst run is wrong: stopping to save credits.'); console.log(r.text.slice(0, 1500)); writeFileSync(out, JSON.stringify({ stopped: item.q, PRODUCT, OLDER }, null, 2)); process.exit(2); }
    }
  }
}

await runSet(PRODUCT, 1, 'product');
await runSet(PRODUCT, 5, 'product');
await runSet(OLDER, 1, 'older');

console.log('\n| Question | runs with the page numbers | same numbers in all runs |\n|---|---|---|');
for (const it of PRODUCT) {
  const good = it.runs.filter(r => r.ok).length;
  const same = it.runs.every(r => JSON.stringify(r.nums) === JSON.stringify(it.runs[0].nums));
  console.log(`| ${it.q} | ${good}/${it.runs.length} | ${same ? 'yes' : 'no'} |`);
}
for (const it of OLDER) console.log(`| ${it.q} (${it.note}) | ${it.runs.filter(r => r.ok).length}/1 | n/a |`);
writeFileSync(out, JSON.stringify({ PRODUCT, OLDER }, null, 2));
const allOk = PRODUCT.every(it => it.runs.every(r => r.ok) && it.runs.every(r => JSON.stringify(r.nums) === JSON.stringify(it.runs[0].nums))) && OLDER.every(it => it.runs[0].ok);
process.exit(allOk ? 0 : 1);
