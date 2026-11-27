// Tables in an answer, for the phone view (and an empty Total row):
//   keyColumns(question, answer)      -> one entry per markdown table: the header of its KEY column (the metric the question asks
//                                        for: value for "value", units for "inward / stock", revenue for "sales"), or null.
//   fillTotals(answer, toolTexts, q)  -> a Total row is never left empty: its empty cells get the connector's own TOTAL from the
//                                        tool result (same column), or the sum of the table's rows when nothing else exists.
//                                        Averages, prices, rates, DOI, shares and % are never totalled.
// Pure functions, no network.
import { indianInt, formatRupees } from './format.js';

const NOT_TOTALLED = /(asp|aov|price|mrp|avg|average|per[ _]|[ _]per|rate|ratio|doi|share|%|margin|days|cover|vs\b|growth|change)/i;
const isTotalCell = c => /^\**\s*(grand\s+)?total\b/i.test(plain(c));
export const plain = s => String(s ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
const norm = s => plain(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

// What the question asks for -> header patterns in priority order.
const METRICS = [
  { when: /\b(value|worth|valuation|valued|cogs|at cost|cost)\b|₹|rupee/i, keys: [/value|worth|₹|cost/i, /revenue|amount/i, /units|qty/i] },
  { when: /\b(sales|sold|sale|revenue|gmv|orders?|aov|net revenue|gross)\b/i, keys: [/revenue|gmv|gross|net|sales|amount|₹/i, /units|orders?/i] },
  { when: /\b(inward|grn|received|receiving|stock|inventory|units?|qty|quantity|pcs|doi|dispatch)\b/i, keys: [/units|qty|quantity|pcs/i, /inward|received/i, /value|₹/i] },
];
const parseRow = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
const isSep = cells => cells.length > 0 && cells.every(c => /^:?-{2,}:?$/.test(c));
const isRowLine = l => /^\s*\|.*\|\s*$/.test(l);

// Markdown tables of an answer with the position of each line: [{ start, end, headers, rows }]
export function findTables(answer) {
  const lines = String(answer).split('\n');
  const out = [];
  for (let i = 0; i < lines.length;) {
    if (!isRowLine(lines[i])) { i++; continue; }
    let j = i;
    while (j < lines.length && isRowLine(lines[j])) j++;
    const cells = lines.slice(i, j).map(parseRow);
    if (cells.length >= 2 && isSep(cells[1])) out.push({ start: i, end: j, headers: cells[0], rows: cells.slice(2) });
    i = j;
  }
  return { lines, tables: out };
}

export function keyColumns(question, answer) {
  const q = String(question || '');
  const metric = METRICS.find(m => m.when.test(q));
  return findTables(answer).tables.map(t => {
    const cand = t.headers.map((h, j) => ({ h: plain(h), j })).filter(x => x.j > 0 && x.h);
    const order = metric ? metric.keys : [];
    for (const re of order) { const hit = cand.find(x => re.test(x.h)); if (hit) return hit.h; }
    return null; // the phone view then falls back to its own order
  });
}

// ── totals ──
const UNIT = { cr: 1e7, l: 1e5, k: 1e3, m: 1e6 };
function parseNum(raw) {
  const t = plain(raw).replace(/^[▲▼]\s?/, '');
  const m = /^(₹)?\s?(-?[\d,]+(?:\.\d+)?)\s?(Cr|L|K|M)?$/i.exec(t);
  if (!m) return null;
  const n = parseFloat(m[2].replace(/,/g, ''));
  return Number.isFinite(n) ? { n: n * (m[3] ? UNIT[m[3].toLowerCase()] : 1), money: !!m[1] || !!m[3], unit: m[3] ? m[3].toLowerCase() : '' } : null;
}

// Tab-separated tables inside tool results: [{ headers, total: [cells] | null }]
function toolTables(toolTexts) {
  const out = [];
  for (const text of toolTexts) {
    const lines = String(text).split('\n');
    for (let i = 0; i < lines.length;) {
      if (!lines[i].includes('\t')) { i++; continue; }
      let j = i;
      while (j < lines.length && lines[j].includes('\t')) j++;
      const rows = lines.slice(i, j).map(l => l.split('\t'));
      const total = rows.slice(1).find(r => /^\s*(grand\s+)?total\b/i.test(r[0]));
      if (rows.length >= 2 && total) out.push({ headers: rows[0], total });
      i = j;
    }
  }
  return out;
}
const clean = c => String(c).replace(/ \(raw [-\d.]+\)/g, '').trim();
const sameHeader = (a, b) => { const x = norm(a), y = norm(b); return x && y && (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)))); };

export function fillTotals(answer, toolTexts = [], question = '') {
  const { lines, tables } = findTables(answer);
  if (!tables.length) return answer;
  const tools = toolTables(toolTexts);
  const topN = /\btop\s*\d+|\bbest\b|\bworst\b|\bfirst\s*\d+/i.test(question);
  let changed = false;
  for (const t of tables) {
    const ti = t.rows.findIndex(r => isTotalCell(r[0]));
    if (ti < 0) continue;
    const body = t.rows.filter((r, i) => i !== ti && !isTotalCell(r[0]));
    const hasOther = body.some(r => /^\**\s*(other|others)\b/i.test(plain(r[0])));
    const row = t.rows[ti].slice();
    while (row.length < t.headers.length) row.push('');
    let touched = false;
    for (let j = 1; j < t.headers.length; j++) {
      if (plain(row[j]) !== '' && plain(row[j]) !== '-' && plain(row[j]) !== '—') continue;
      const h = plain(t.headers[j]);
      if (NOT_TOTALLED.test(h)) continue;
      // 1. the connector's own TOTAL for this column
      let val = null;
      for (const tt of tools) {
        const k = tt.headers.findIndex(x => sameHeader(x, h));
        if (k > 0 && tt.total[k] && clean(tt.total[k])) { val = clean(tt.total[k]); break; }
      }
      // 2. else the sum of the rows, only when every row is a number of the same kind and the table is not a top-N cut
      if (val === null && !topN && !hasOther) {
        const parsed = body.map(r => parseNum(r[j]));
        if (parsed.length >= 2 && parsed.every(Boolean) && new Set(parsed.map(p => p.money)).size === 1) {
          const sum = parsed.reduce((a, p) => a + p.n, 0);
          val = parsed[0].money ? formatRupees(sum) : indianInt(Math.round(sum * 100) / 100);
        }
      }
      if (val !== null) { row[j] = `**${val.replace(/\*/g, '')}**`; touched = true; }
    }
    if (touched) { lines[t.start + 2 + ti] = `| ${row.join(' | ')} |`; changed = true; }
  }
  return changed ? lines.join('\n') : answer;
}
