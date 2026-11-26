// "Every number in an answer comes from a tool, never from the model's own arithmetic."
//
// knownNumbers(texts)   all numbers that appear in the tool results (raw and formatted: 66,074 / 1,53,451 / ₹1.5 L / 12.3% / 66.07K)
// unverified(answer, k) numbers in the model's text that are not in the tool results (allowing formatting and rounding)
//
// What is checked: rupee amounts, percentages, K / L / Cr / M amounts, decimals, and plain numbers of 1,000 or more (not years).
// What is not: small whole numbers (counts like "3 SKUs", dates, day numbers, list numbers), years, and anything inside a
// SKU code or size ("FR-OPC-L1", "35x40x8"). A number is verified when a tool result holds a value that rounds to what is shown,
// at the precision shown (₹5.13 L matches 513,000 within ±₹500).

const SCALE = { cr: 1e7, l: 1e5, k: 1e3, m: 1e6 };
const NUM = /(?<![A-Za-z0-9_\-.,])(₹\s?)?(-?\d(?:[\d,]*\d)?(?:\.\d+)?)(\s?%|\s?(?:Cr|L|K|M)(?![A-Za-z0-9]))?(?![A-Za-z0-9_])/g;

function parse(m) {
  const rupee = !!m[1];
  const raw = m[2];
  const suffix = (m[3] || '').trim();
  const clean = raw.replace(/,/g, '');
  const value = Number(clean);
  if (!Number.isFinite(value)) return null;
  const decimals = (clean.split('.')[1] || '').length;
  const pct = suffix === '%';
  const scale = pct ? 1 : SCALE[suffix.toLowerCase()] || 1;
  return { raw: (m[1] || '') + raw + (m[3] || ''), value, decimals, scale, pct, rupee, plain: !rupee && !suffix, grouped: raw.includes(',') };
}

// Numbers the answer must be able to prove.
function needsProof(t) {
  if (t.pct || t.rupee || !t.plain) return true;                       // %, ₹, K/L/Cr/M
  if (t.decimals > 0) return true;                                     // 1.34, 4.34
  const a = Math.abs(t.value);
  if (!t.grouped && a >= 1900 && a <= 2100) return false;               // a year
  return a >= 1000;                                                    // 66,074 / 18290
}

export function knownNumbers(texts) {
  const vals = [];
  for (const text of texts) {
    for (const m of String(text).matchAll(NUM)) {
      const t = parse(m);
      if (!t) continue;
      const v = t.value * t.scale;
      vals.push(v);
      if (Math.abs(v) <= 2) vals.push(v * 100);                          // a fraction shown as a percentage
    }
  }
  vals.sort((a, b) => a - b);
  return vals;
}

function has(sorted, x, tol) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < x - tol) lo = mid + 1; else hi = mid; }
  return lo < sorted.length && sorted[lo] <= x + tol;
}

export function unverified(answer, known) {
  const bad = [];
  for (const m of String(answer).matchAll(NUM)) {
    const t = parse(m);
    if (!t || !needsProof(t)) continue;
    const x = t.value * t.scale;
    const tol = 0.5 * Math.pow(10, -t.decimals) * t.scale + 1e-6;
    if (!has(known, x, tol) && !has(known, -x, tol)) bad.push(t.raw.trim());
  }
  return [...new Set(bad)];
}

// Replace every markdown table in `answer` with `table` (the first one is replaced, the rest dropped).
export function replaceTables(answer, table) {
  const lines = String(answer).split('\n');
  const out = [];
  let inTable = false, placed = false;
  for (const l of lines) {
    const isRow = /^\s*\|.*\|\s*$/.test(l);
    if (isRow) {
      if (!placed) { out.push(table); placed = true; }
      inTable = true;
      continue;
    }
    if (inTable && l.trim() === '') { inTable = false; out.push(l); continue; }
    inTable = false;
    out.push(l);
  }
  return placed ? out.join('\n') : `${answer}\n\n${table}`;
}

// A markdown table from the connector's own tab-separated result (header line first). Max `limit` rows.
export function tsvToMarkdown(tsv, limit = 15) {
  const lines = String(tsv).split('\n').filter(l => l.includes('\t'));
  if (lines.length < 2) return '';
  const head = lines[0].split('\t');
  const clean = c => String(c).replace(/ \(raw [-\d.]+\)/g, '').replace(/\|/g, '/');
  const rows = lines.slice(1, limit + 1).map(l => l.split('\t'));
  return [`| ${head.map(clean).join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(clean).join(' | ')} |`)].join('\n');
}
