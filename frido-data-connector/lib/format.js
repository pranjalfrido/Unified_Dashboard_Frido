// Formats query results in the Indian system BEFORE the model sees them, so the model copies the
// formatted value and never converts units itself (the 12,330,000 = "₹12.33 L" bug).
//   ₹ amounts: >= 1 Cr -> ₹x.xx Cr, >= 1 L -> ₹x.xx L, below -> ₹ with Indian commas
//   counts: Indian commas (1,53,451)     percentages: 1 decimal
// Every formatted cell carries the raw value:  ₹1.23 Cr (raw 12330000)

const MONEY = /(revenue|\brev\b|_rev\b|sales|amount|cost|spend|gmv|price|\basp\b|\baov\b|\bvalue\b|loss|cogs|margin|\bcm1\b|\bmrp\b|freight|charges|refund|\bgst\b)/i;
const COUNT = /(units|\bqty\b|quantity|orders|\bcount\b|shipments|stock|inventory|skus|customers|tickets|^n$|_n$|total_rows|\brows\b|\bnum_|stuck|pending|delivered|\brto\b$|\bcir\b$)/i;
const PCT = /(pct|percent|_percentage)/i;
const NOT_MONEY = /(pct|percent|rate$|ratio|share|qty|units|orders|count|days|doi|lakhs|crores|per_day|daily|_cr$|_l$)/i;

export function indianInt(n) {
  const neg = n < 0;
  const s = String(Math.round(Math.abs(n)));
  let out;
  if (s.length <= 3) out = s;
  else out = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3);
  return (neg ? '-' : '') + out;
}

export function formatRupees(n) {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  if (a < 100 && a % 1 !== 0) return `${sign}₹${a.toFixed(2)}`;
  return `${sign}₹${indianInt(a)}`;
}

function kindOf(header) {
  if (PCT.test(header)) return 'pct';
  if (MONEY.test(header) && !NOT_MONEY.test(header)) return 'money';
  if (COUNT.test(header) && !NOT_MONEY.test(header.replace(/(units|qty|orders|count)/i, ''))) return 'count';
  return null;
}

// Input: tab-separated text (header line first) as produced by lib/bigquery.js / lib/supabase.js.
export function formatTsv(text) {
  const lines = String(text).split('\n');
  if (lines.length < 2 || !lines[0].includes('\t')) return text;
  const headers = lines[0].split('\t');
  const kinds = headers.map(kindOf);
  if (kinds.every(k => !k)) return text;
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('\t');
    if (cells.length !== headers.length) { out.push(lines[i]); continue; }
    out.push(cells.map((c, j) => {
      const k = kinds[j];
      if (!k || c === '' || c === 'NULL' || !/^-?\d+(\.\d+)?$/.test(c.trim())) return c;
      const n = Number(c);
      if (k === 'money') return `${formatRupees(n)} (raw ${c})`;
      if (k === 'count') return `${indianInt(n)}`;
      return `${n.toFixed(1)}% (raw ${c})`;
    }).join('\t'));
  }
  return out.join('\n');
}
