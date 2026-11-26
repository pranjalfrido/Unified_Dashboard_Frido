// Ask the connector's /chat endpoint one or more questions and save the answers (for tests).
//   node --env-file=.env scripts/pulse-ask.mjs <baseUrl> <out.json> "question 1" "question 2" ...
// The API key is read from CONNECTOR_API_KEY and is never printed.
import { writeFileSync, readFileSync } from 'fs';

const [base, out, ...questions] = process.argv.slice(2);
const key = process.env.CONNECTOR_API_KEY;
if (!base || !out || !questions.length || !key) {
  console.error('usage: node --env-file=.env scripts/pulse-ask.mjs <baseUrl> <out.json> "question" ...');
  process.exit(1);
}

// PULSE_ASK_ATTACH_FILE = path to a JSON file made by scripts/make-test-attachments.mjs (an array of attachments), sent with every
// question, as the dashboard would for a user with the 'ask:files' permission. Contents are never printed.
const attachments = process.env.PULSE_ASK_ATTACH_FILE ? JSON.parse(readFileSync(process.env.PULSE_ASK_ATTACH_FILE, 'utf8')) : undefined;

const results = [];
for (const q of questions) {
  const t0 = Date.now();
  let status = 0, body = {};
  try {
    const r = await fetch(`${base}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      // PULSE_ASK_ACCESS = JSON like {"isAdmin":true,"tabs":[]} or {"isAdmin":false,"tabs":["inventory:inward"]}: the page access api/pulse.js would send for that user.
      // Without it the connector refuses every data tool (fail closed).
      body: JSON.stringify({ messages: [{ role: 'user', content: q, ...(attachments ? { attachments } : {}) }], access: process.env.PULSE_ASK_ACCESS ? JSON.parse(process.env.PULSE_ASK_ACCESS) : undefined }),
      signal: AbortSignal.timeout(290000),
    });
    status = r.status;
    body = await r.json().catch(() => ({}));
  } catch (e) {
    body = { error: String(e.message) };
  }
  const row = { question: q, status, seconds: Math.round((Date.now() - t0) / 100) / 10, model: body.model, text: body.text || body.error, sql: body.sql };
  results.push(row);
  console.log(`\n=== ${q}\n[${status}, ${row.seconds}s, ${row.model || '-'}]\n${row.text}`);
  writeFileSync(out, JSON.stringify(results, null, 2));
}
