// Formats query results in the Indian system BEFORE the model sees them, so the model copies the
// formatted value and never converts units itself (the 12,330,000 = "₹12.33 L" bug).
//   ₹ amounts: >= 1 Cr -> ₹x.xx Cr, >= 1 L -> ₹x.xx L, below -> ₹ with Indian commas
//   counts: Indian commas (1,53,451)     percentages: 1 decimal
// Every formatted cell carries the raw value:  ₹1.23 Cr (raw 12330000)

// Money columns are recognised by the words in the column name (split on _ , spaces and camelCase):
// rev, revenue, gross, net, amount, value, cost, sales, asp, aov, price (and names ending in them, e.g. cir_rev,
// totalrevenue, invoicevalue), plus loss / spend / cogs / margin / mrp / freight / refund. CLAUDE.md tells the
// model to ALWAYS alias money columns with one of these words.
const MONEY_WORDS = /^(rev|revenue|gross|net|amount|value|cost|sales|asp|aov|price|loss|spend|cogs|margin|cm1|mrp|freight|refund|gmv)$/;
const MONEY_SUFFIX = /(rev|revenue|amount|value|cost|sales|price|loss|spend|cogs|margin|freight|refund|gmv)$/;
const COUNT = /(units|qty|quantity|orders|count|shipments|stock|inventory|skus|customers|tickets|^n$|_n$|total_rows|rows|num_|stuck|pending|delivered|rto$|cir$)/i;
const PCT = /(pct|percent|_percentage)/i;
const NOT_MONEY = /(pct|percent|rate$|ratio|share|qty|units|orders|count|days|doi|lakhs|crores|per_day|daily|_cr$|_l$)/i;

function isMoneyName(header) {
  const tokens = header.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some(t => t !== 'prev' && (MONEY_WORDS.test(t) || MONEY_SUFFIX.test(t)));
}

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
  if (isMoneyName(header) && !NOT_MONEY.test(header)) return 'money';
  if (COUNT.test(header) && !NOT_MONEY.test(header.replace(/(units|qty|orders|count)/i, ''))) return 'count';
  return null;
}

// Input: tab-separated text (header line first) as produced by lib/bigquery.js / lib/supabase.js.
export function formatTsv(text, seen) {
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
      if (k === 'money') { const f = formatRupees(n); if (seen) seen.add(f); return `${f} (raw ${c})`; }
      if (k === 'count') { const f = indianInt(n); if (seen) seen.add(f); return f; }
      return `${n.toFixed(1)}% (raw ${c})`;
    }).join('\t'));
  }
  return out.join('\n');
}

// Numbers in a model answer that did not come from the formatted results: any rupee amount, or a bare
// number >= 1,00,000, that is not one of the values the connector formatted. Used to send an answer back once.
export function unformattedNumbers(answer, seen) {
  const bad = [];
  const text = String(answer);
  for (const m of text.matchAll(/₹\s?-?[\d,]+(?:\.\d+)?(?:\s?(?:Cr|L)(?![A-Za-z]))?/g)) {
    const v = m[0].replace(/\s+/g, ' ').replace('₹ ', '₹').trim();
    if (![...seen].some(f => f === v || f.replace(/\s/g, '') === v.replace(/\s/g, ''))) bad.push(v);
  }
  for (const m of text.matchAll(/(?<![\d,.₹])(\d{1,3}(?:,\d{2,3})+|\d{6,})(?![\d,]*\.\d)(?!\s?(?:Cr|L)(?![A-Za-z]))/g)) {
    const raw = m[1];
    const n = Number(raw.replace(/,/g, ''));
    if (n >= 100000 && !/^(19|20)\d{2}$/.test(raw) && ![...seen].includes(raw) && ![...seen].includes(indianInt(n))) bad.push(raw);
  }
  return [...new Set(bad)];
}

// One value formatted by its field name (used by dashboard_api for scalar fields): money -> ₹ Cr/L, count -> Indian commas,
// percent -> 1 decimal. Unrecognised names stay as they are.
export function formatValueByName(name, value, seen) {
  const k = kindOf(String(name));
  if (k === 'money') { const f = formatRupees(value); if (seen) seen.add(f); return `${f} (raw ${value})`; }
  if (k === 'count') { const f = indianInt(value); if (seen) seen.add(f); return f; }
  if (k === 'pct') return `${Number(value).toFixed(1)}% (raw ${value})`;
  return String(value);
}
