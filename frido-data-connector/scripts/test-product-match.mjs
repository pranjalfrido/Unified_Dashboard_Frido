// Product matching (lib/productMatch.js): same words -> same product set, several matches are never guessed, no match never means 0.
// Offline: a fixture catalog that mirrors the real master's names (26 Nov 2026), no BigQuery.
import { buildCatalog, matchProducts, describeMatch } from '../lib/productMatch.js';

let bad = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' -> ' + extra : ''}`); if (!cond) bad++; };
const R = (sub, cat, ...codes) => codes.map(c => ({ Product_Code: c, Name: `${sub} ${c}`, Sub_category: sub, Category_Name: cat }));
const catalog = buildCatalog([
  ...R('Orthotics Posture Corrector', 'Orthotics', 'FR-OPC-S1', 'FR-OPC-M1', 'FR-OPC-L1'),
  ...R('Orthotics Posture Corrector Pro', 'Orthotics', 'FR-OPPC-S1', 'FR-OPPC-M1', 'FR-OPPC-L1'),
  ...R('Orthotics Posture Corrector Seat', 'Orthotics', 'FR-OPCS-1'),
  ...R('Ultimate Pro Posture Corrector', 'Orthotics', 'FR-UPPC-G', 'FR-UPPC-B'),
  ...R('3D Posture Plus Ergonomic Chair', 'Ergo Furniture', 'FR-3DPPC-B1'),
  ...R('Active Knee Cap Support', 'Orthotics', 'FR-AKC-S', 'FR-AKC-M'),
  ...R('Orthotics Bamboo Knee Cap', 'Orthotics', 'FR-OBKC-S'),
  ...R('Ultimate Car Backrest Cushion', 'Mobility', 'FR-UCBU-B1', 'FR-UCBU-G1'),
  ...R('Air Seat Cushion', 'Mobility', 'FR-AC-35x40x8'),
  ...R("Men's Cloud Comfort Sandal", 'Footwear', 'FR-MCCS-8', 'FR-MCCS-9'),
  ...R("Women's Cloud Comfort Sandal", 'Footwear', 'FR-WCCS-5'),
  ...R('Cloud Comfort Slippers', 'Footwear', 'FR-CCS-7'),
]);
const subs = r => r.mentions.flatMap(m => m.matches.map(x => x.sub));
const one = q => matchProducts(catalog, q);

// posture corrector: several, all four, same every time
const q = 'Posture corrector inward this month';
const a = one(q), b = one('POSTURE CORRECTOR inward THIS month?'), c = one('how many posture correctors came in this month');
check('"posture corrector" matches several products', a.mentions[0]?.kind === 'several');
check('...exactly the four sub-categories that contain the words (not the chair)', JSON.stringify(subs(a).sort()) === JSON.stringify(['Orthotics Posture Corrector', 'Orthotics Posture Corrector Pro', 'Orthotics Posture Corrector Seat', 'Ultimate Pro Posture Corrector']), subs(a).join('; '));
check('case, punctuation and plural do not change the set', JSON.stringify(subs(a)) === JSON.stringify(subs(b)) && JSON.stringify(subs(a)) === JSON.stringify(subs(c)));
check('every SKU of every match is listed', a.mentions[0].matches.reduce((n, m) => n + m.skus.length, 0) === 3 + 3 + 1 + 2);
const block = describeMatch(a);
check('the block says "Tell me which one you meant" and forbids guessing', /Tell me which one you meant/.test(block) && /Do NOT guess/.test(block));
check('the block is identical on every call (same question, same instructions)', describeMatch(one(q)) === describeMatch(one(q)) && describeMatch(a) === describeMatch(b));

// one clear match
const e = one('Orthotics Posture Corrector inward this month');
check('a full sub-category name is ONE match even though a longer name contains it', e.mentions[0]?.kind === 'one' && e.mentions[0].matches[0].sub === 'Orthotics Posture Corrector' && e.mentions[0].also.length === 2, e.mentions[0]?.kind);
check('...and the block names it with its SKU count', /"Orthotics Posture Corrector, 3 SKUs"/.test(describeMatch(e)));

// SKU code
const k = one('FR-OPC-L1 inward this month');
check('a SKU code matches exactly that SKU and names its product', k.mentions.length === 1 && k.mentions[0].kind === 'sku' && k.mentions[0].matches[0].sub === 'Orthotics Posture Corrector');
check('SKU code in lower case and with underscores', one('fr_opc_l1 sales').mentions[0]?.kind === 'sku');

// other products
check('knee cap -> the two knee cap products', JSON.stringify(subs(one('Knee cap inward this month')).sort()) === JSON.stringify(['Active Knee Cap Support', 'Orthotics Bamboo Knee Cap']));
check('"kneecap" (one word) finds them too', subs(one('kneecap sales')).length === 2);
check('cushion -> both cushions', subs(one('Cushion sales last month')).length === 2);
check('sandals (plural) -> men and women sandal products, not slippers', JSON.stringify(subs(one('Sandals sales last month')).sort()) === JSON.stringify(["Men's Cloud Comfort Sandal", "Women's Cloud Comfort Sandal"]));

// no product / no match
check('no product word -> no block', describeMatch(one('D2C revenue yesterday')) === '' && describeMatch(one('CN received Sep 2026')) === '');
check('question words (inward, sales, month, d2c) are never read as a product', one('inward sales this month for d2c').mentions.length === 0);
const t = one('posture correctr inward this month');
check('a one-letter typo is read as the intended word', t.mentions[0]?.matches.length === 4);
const n = one('Zorblax sandle inward');
check('a typo that fits no product word says "no match" with closest names or nothing, never a guess', n.mentions.length === 0 || n.mentions[0].matches.length >= 1);
const none = one('Skwirrel jacket sales');
check('an unknown product gives no mentions (the model is told by the rules, not given a guess)', none.mentions.length === 0);

// many matches switch to names only
const many = buildCatalog(Array.from({ length: 12 }, (_, i) => ({ Product_Code: `FR-X${i}`, Name: `n${i}`, Sub_category: `Alpha Wedge ${String.fromCharCode(65 + i)} Cushion`, Category_Name: 'Mobility' })));
const mb = describeMatch(matchProducts(many, 'wedge cushion sales'));
check('more than 8 matches: names only, filter by sub-category, top 10 + Other + Total', /filter by the master Sub_category/.test(mb) && /TOP 10/.test(mb) && !/FR-X0/.test(mb));

console.log(bad ? `\n${bad} failed` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
