// One shared product-matching step for NavAI (every tool uses the result; the model never decides which product a word means).
//
// Problem (26 Nov 2026): "Posture corrector inward this month" answered 66,074 / 60,734 / 0 / 33,181 on different runs, because the
// words match several sub-categories and the model picked a different set each time.
//
// Rules (all in code, so the same question gives the same product set every time):
//   * Words are matched, case-insensitively, against the product master: Sub_category (the product), Name and Product_Code (SKU).
//   * A SKU code (e.g. FR-OPC-L1) matches exactly that SKU, and says which product it belongs to.
//   * A sub-category name typed in full (e.g. "Orthotics Posture Corrector") is one clear match, even when a longer name contains it.
//   * Words that fit several products ("posture corrector" -> 3 sub-categories) are NOT guessed: all matches are returned with
//     their SKUs, and the answer must be a per-product breakdown plus the total, ending "Tell me which one you meant" only when the matches are clearly different products (variants / combos of one product need no question).
//   * Nothing matches -> say so and offer the closest names; never answer 0 because a match failed.
// Pure functions (buildCatalog, matchProducts, describeMatch) are unit-tested with a fixture; loadCatalog reads the master from BigQuery.
import { getBQ, guardSql } from './bigquery.js';

const TTL_MS = 60 * 60 * 1000;
const MANY = 8; // more matching products than this: names only, filter by sub-category, top 10 + total
let cache = null; // { at, catalog }

const SQL = 'SELECT Product_Code, Name, Sub_category, Category_Name FROM `frido-429506.sharepoint_to_gcp.Frido_Item_Master__frido_item_sku_master` WHERE Product_Code IS NOT NULL AND TRIM(Product_Code) != \'\'';

export async function loadCatalog() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.catalog;
  guardSql(SQL);
  const [rows] = await getBQ().query({ query: SQL, maximumBytesBilled: String(1024 ** 3) });
  const catalog = buildCatalog(rows);
  cache = { at: Date.now(), catalog };
  return catalog;
}
export function resetCatalogCache() { cache = null; }

// ── words ────────────────────────────────────────────────────────────────────────────────────────────────────
// Words that describe the question, not the product. A product word is never in this list.
const STOP = new Set(('a an and any are as at be by can could did do does for from get give has have how i in is it its last list me my of on or our ' +
  'please show tell that the their them there these this those to us was we were what when which who why will with you your about across all also ' +
  'compare comparison data details detail latest current currently now new old per than then up down vs versus ' +
  'inward inwarded inwards grn grns received receive receipt receipts stock inventory doi days day week weeks month months year years quarter ytd mtd wtd ' +
  'today yesterday tomorrow previous prev next first second third top bottom best worst highest lowest most least many much total totals overall ' +
  'sale sales sold selling sell revenue revenues units unit qty quantity quantities orders order value amount number numbers count average avg daily ' +
  'return returns rto cancel cancelled cancellation margin profit loss cogs price mrp asp ads ad spend roas cac ' +
  'd2c amazon flipkart myntra blinkit zepto instamart shopify ebo offline retail b2b b2c channel channels platform platforms ' +
  'category categories sub subcategory product products item items sku skus name names code codes ' +
  'jan feb mar apr may jun jul aug sep sept oct nov dec january february march april june july august september october november december ' +
  'q1 q2 q3 q4 fy rs inr lakh lakhs cr crore crores percent pct rate ratio share by between within during after before since until till into over under ' +
  'out of oos low critical excess dead slow moving status location warehouse vendor vendors supplier suppliers rejected rejection rejections').split(/\s+/));

function singular(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  return w;
}
// "Knee Cap" and "kneecap" are the same product word.
const squash = ws => ws.join('');
export const tokens = text => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map(singular);

const cleanCode = x => String(x).toUpperCase().replace(/[^A-Z0-9-]/g, '');

// catalog = { products: [{ sub, category, skus:[{code,name}], toks:Set, key }], codes: Map(cleanCode -> {code, sub, category, name}), vocab: Set }
export function buildCatalog(rows) {
  const byName = new Map();
  const codes = new Map();
  for (const r of rows) {
    const sub = String(r.Sub_category || '').trim();
    const code = String(r.Product_Code || '').trim();
    if (!code) continue;
    const cat = String(r.Category_Name || '').trim();
    const nm = String(r.Name || '').trim();
    codes.set(cleanCode(code), { code, sub, category: cat, name: nm });
    if (!sub) continue;
    const k = sub.toLowerCase();
    let p = byName.get(k);
    if (!p) { p = { sub, category: cat, skus: [], names: new Set(), toks: new Set(tokens(sub)), key: tokens(sub).join(' '), squashed: squash(tokens(sub)) }; byName.set(k, p); }
    if (!p.skus.some(s => s.code === code)) p.skus.push({ code, name: nm });
    if (nm) for (const t of tokens(nm)) p.names.add(t);
  }
  const products = [...byName.values()].sort((a, b) => a.sub.localeCompare(b.sub));
  const vocab = new Set();
  for (const p of products) for (const t of p.toks) vocab.add(t);
  return { products, codes, vocab };
}

// All n-grams (longest first) of the question's words.
function spans(toks) {
  const out = [];
  for (let n = Math.min(4, toks.length); n >= 1; n--) for (let i = 0; i + n <= toks.length; i++) out.push({ i, n, words: toks.slice(i, i + n) });
  return out;
}
const isStop = w => STOP.has(w) || STOP.has(w + 's');

// Products whose sub-category name contains every word of the span; exact = the span IS the whole name.
// Only when no sub-category fits, the product Names (SKU level) are tried, so a stray word in a SKU name never widens a clear match.
function productsFor(catalog, words) {
  const key = words.join(' '), sq = squash(words);
  const tryWith = useNames => {
    const hits = [];
    for (const p of catalog.products) {
      const have = useNames ? new Set([...p.toks, ...p.names]) : p.toks;
      const all = words.every(w => have.has(w));
      const joined = !all && (words.length > 1 || sq.length >= 6) && p.squashed.includes(sq); // "knee cap" vs "kneecap"
      if (!(all || joined)) continue;
      const exact = !useNames && (p.key === key || p.squashed === sq);
      hits.push({ sub: p.sub, category: p.category, skus: p.skus.map(s => s.code), score: exact ? 1 : Math.round((words.length / p.toks.size) * 100) / 100, exact, via: useNames ? 'name' : 'sub-category' });
    }
    return hits;
  };
  const bySub = tryWith(false);
  return bySub.length ? bySub : tryWith(true);
}

// Closest product names for a word that matched nothing (small typos: "posture correctr", "sandle").
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
const sim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length);
function closest(catalog, words, limit = 4) {
  const scored = [];
  for (const p of catalog.products) {
    let best = 0;
    for (const w of words) for (const t of p.toks) best = Math.max(best, sim(w, t));
    scored.push({ sub: p.sub, score: best });
  }
  return scored.filter(s => s.score >= 0.6).sort((a, b) => b.score - a.score || a.sub.localeCompare(b.sub)).slice(0, limit).map(s => s.sub);
}

// Variants of one product (Pro / Plus / Combo / Pack / size / colour ...) are one "family"; "Posture Corrector" and "Posture Corrector Seat" are not.
// The "Tell me which one you meant" question is only asked when the matches span more than one family.
const VARIANT_WORDS = new Set(['pro', 'plus', 'max', 'lite', 'mini', 'combo', 'pack', 'set', 'kit', 'pair', 'with', 'without', 'case', 'cover', 'small', 'medium', 'large', 'xl', 'black', 'blue', 'grey', 'gray', 'white', 'red', 'green', 'pink', 'beige', 'brown', 'kids', 'kid', 'men', 'mens', 'women', 'womens', 'unisex', 'of', 'and']);
export function familiesOf(matches) {
  const keys = new Set();
  for (const m of matches || []) {
    const k = tokens(m.sub || '').filter(w => !VARIANT_WORDS.has(w) && !/^\d+$/.test(w)).join(' ');
    keys.add(k || String(m.sub || '').toLowerCase());
  }
  return keys.size;
}

// text -> { mentions: [{ text, kind: 'sku'|'one'|'several', matches: [{sub, category, skus, score, exact, sku?}] }], none: [{ text, closest: [] }] }
export function matchProducts(catalog, text) {
  const raw = String(text || '');
  const mentions = [];
  const taken = new Set(); // indexes of question words already explained by a SKU code or a product span

  // 1. SKU codes: FR-OPC-L1, fr-opc-l1, FR_OPC_L1 (tried as written and with "_" read as "-")
  const wordsRaw = raw.split(/[\s,;:()?!"']+/).filter(Boolean);
  const seen = new Set();
  for (const w of wordsRaw) {
    const c = cleanCode(w.replace(/_/g, '-').replace(/\.$/, ''));
    if (c.length < 4 || seen.has(c)) continue;
    const hit = catalog.codes.get(c);
    if (hit) { seen.add(c); mentions.push({ text: hit.code, kind: 'sku', matches: [{ sub: hit.sub, category: hit.category, skus: [hit.code], score: 1, exact: true, sku: hit.code, name: hit.name }] }); }
  }
  const codeWords = new Set(mentions.map(m => m.text.toLowerCase()));

  // 2. product words: longest span first, never overlapping, never made only of question words
  // a word that is not a known word but is one letter or so away from one ("correctr", "sandle") is read as that word
  const fix = w => {
    if (isStop(w) || catalog.vocab.has(w) || w.length < 5) return w;
    let best = null, bs = 0;
    for (const v of catalog.vocab) { if (v[0] !== w[0] || Math.abs(v.length - w.length) > 2) continue; const x = sim(w, v); if (x > bs) { bs = x; best = v; } }
    return bs >= 0.8 ? best : w;
  };
  const toks = tokens(raw.replace(/[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+/g, m => (catalog.codes.has(cleanCode(m.replace(/_/g, '-'))) ? ' ' : m))).map(fix);
  for (const s of spans(toks)) {
    if (s.words.some(w => isStop(w)) || s.words.every(w => w.length < 3)) continue;
    if ([...Array(s.n).keys()].some(k => taken.has(s.i + k))) continue;
    const hits = productsFor(catalog, s.words);
    if (!hits.length) continue;
    for (let k = 0; k < s.n; k++) taken.add(s.i + k);
    const exact = hits.filter(h => h.exact);
    const matches = (exact.length ? exact : hits).sort((a, b) => b.score - a.score || a.sub.localeCompare(b.sub));
    mentions.push({ text: s.words.join(' '), kind: matches.length === 1 ? 'one' : 'several', distinct: familiesOf(matches) > 1, matches, also: exact.length && hits.length > exact.length ? hits.filter(h => !h.exact).map(h => h.sub) : [] });
  }

  // 3. leftover product-looking words that resemble a product name: a typo -> "no match", with the closest names
  const none = [];
  const left = toks.filter((w, i) => !taken.has(i) && !isStop(w) && w.length >= 4 && !catalog.vocab.has(w));
  if (!mentions.length && left.length) {
    const c = closest(catalog, left);
    if (c.length) none.push({ text: left.join(' '), closest: c });
  }
  return { mentions, none, codeWords: [...codeWords] };
}

// The block that goes in front of the model's question. Empty string = no product in the question.
export function describeMatch(result) {
  const { mentions, none } = result;
  if (!mentions.length && !none.length) return '';
  const lines = ['[Product match, decided by the connector. It is authoritative: do not re-match product words yourself and do not pick a subset.]'];
  for (const m of mentions) {
    if (m.kind === 'sku') {
      const x = m.matches[0];
      lines.push(`- "${m.text}" is the SKU ${x.sku} (${x.name || 'no name'}), product "${x.sub || 'not in SKU master'}", category ${x.category || '-'}. Use exactly this SKU (masterskucode = '${x.sku}'); say which product it belongs to.`);
    } else if (m.kind === 'one') {
      const x = m.matches[0];
      lines.push(`- "${m.text}" matches ONE product: "${x.sub}" (${x.category || '-'}), ${x.skus.length} SKU${x.skus.length === 1 ? '' : 's'}: ${x.skus.join(', ')}. Use exactly these SKUs (or Sub_category = '${x.sub.replace(/'/g, "''")}') in every query, and say in the first line which product you used, e.g. "${x.sub}, ${x.skus.length} SKU${x.skus.length === 1 ? '' : 's'}".${m.also?.length ? ` (Longer names that also contain these words are NOT included: ${m.also.join('; ')}.)` : ''}`);
    } else {
      lines.push(`- "${m.text}" matches ${m.matches.length} products. Do NOT guess one. Use ALL of them, in this order:`);
      if (m.matches.length <= MANY) {
        for (const x of m.matches) lines.push(`    * "${x.sub}" (${x.category || '-'}), ${x.skus.length} SKU${x.skus.length === 1 ? '' : 's'}: ${x.skus.join(', ')}`);
        lines.push(`  Answer with the TOTAL across all of them first, then a short table with one row per product above (same order, same columns, a Total row)${m.distinct ? ', and end with "Tell me which one you meant."' : '. These are variants / combos of the same product, so do NOT ask which one they meant'}. Never drop a product and never add one.`);
      } else {
        for (const x of m.matches) lines.push(`    * "${x.sub}" (${x.category || '-'}), ${x.skus.length} SKUs`);
        lines.push(`  That is a long list, so filter by the master Sub_category (join the SKU master) with exactly these ${m.matches.length} names, never by a SKU list you write yourself. Answer with the TOTAL across all of them first, then a table of the TOP 10 products by the metric asked (ties: name A to Z) plus an "Other ${m.matches.length - 10} products" row and a Total row${m.distinct ? ', and end with "Tell me which one you meant."' : '. These are variants / combos of the same product, so do NOT ask which one they meant'}. Never drop a product and never add one.`);
      }
    }
  }
  for (const n of none) {
    lines.push(`- "${n.text}" matches no product. Say so plainly, do not run data queries for it, never answer 0. Closest names: ${n.closest.join('; ')}. Ask which one they meant.`);
  }
  lines.push('Same question, same answer: use these exact product sets, the page figures, and the same column order every time.');
  return lines.join('\n');
}

// What the model's `find_product` tool returns (same logic, as text).
export async function findProductText(query) {
  const catalog = await loadCatalog();
  const r = matchProducts(catalog, query);
  const d = describeMatch(r);
  if (d) return d;
  const c = closest(catalog, tokens(query).filter(w => !isStop(w)));
  return `No product matches "${query}".${c.length ? ` Closest names: ${c.join('; ')}.` : ''} Say so; never answer 0 because of a failed match.`;
}
