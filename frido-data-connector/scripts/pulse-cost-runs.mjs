// Cost check: the same 8 questions once each; prints the answer's key numbers so before/after can be compared. Tokens come from the
// chat_usage log lines (one per answer, no question text), read afterwards with gcloud, in the order the questions ran.
//   node --env-file=.env scripts/pulse-cost-runs.mjs <baseUrl> <out.json>
import { writeFileSync } from 'fs';
const [base, out = 'cost-runs.json'] = process.argv.slice(2);
const key = process.env.CONNECTOR_API_KEY;
if (!base || !key) { console.error('usage: node --env-file=.env scripts/pulse-cost-runs.mjs <baseUrl> <out.json>'); process.exit(1); }
export const QUESTIONS = [
  'What was D2C gross revenue from 1 to 28 Oct 2026?',
  'What was D2C net revenue from 1 to 28 Oct 2026?',
  'Compare Delhivery vs Bluedart delivery rate, Sep 2026',
  'What is the total inventory value right now?',
  'Top 5 products by inventory value',
  'Posture corrector inward this month',
  'Cushion sales last month',
  'CN received by reason for Sep 2026',
];
const nums = t => [...new Set([...String(t).replace(/₹\s?/g, '').matchAll(/(?<![\w.])\d{1,3}(?:,\d{2,3})+(?![\d,])|(?<![\w.,])\d+\.\d+\s?(?:Cr|L|%)|(?<![\w.,])\d{4,}(?![\d,])/g)].map(m => m[0]))].sort();
const results = [];
for (const q of QUESTIONS) {
  const t0 = Date.now(); const startedAt = new Date().toISOString();
  const r = await fetch(`${base}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key }, body: JSON.stringify({ messages: [{ role: 'user', content: q }], access: { isAdmin: true, tabs: [] }, debugUsage: true }), signal: AbortSignal.timeout(290000) }).catch(e => ({ status: 0, json: async () => ({ error: e.message }) }));
  const b = await r.json().catch(() => ({}));
  results.push({ q, startedAt, status: r.status, seconds: Math.round((Date.now() - t0) / 100) / 10, model: b.model, usage: b.usage, nums: nums(b.text || b.error || ''), text: b.text || b.error });
  console.log(`${r.status} ${results.at(-1).seconds}s | ${q} | ${b.model} | ${b.usage ? JSON.stringify(b.usage) : ''} | ${nums(b.text).slice(0, 6).join(' ')}`);
}
writeFileSync(out, JSON.stringify(results, null, 2));
