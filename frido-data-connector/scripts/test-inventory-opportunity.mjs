// inventory_opportunity: excess stock beyond N days of cover, valuation like the Inventory cost card, all numbers calculated in code.
import { readFileSync } from 'fs';
import XLSX from 'xlsx';
import { buildCogs } from '../lib/inventoryCost.js';
import { analyse, defaultSettings, mergeSettings, settingsLine, parseSettingsLine, settingsFromChat, planText, resultText, buildWorkbook, SALES_SQL } from '../lib/inventoryOpportunity.js';
import { knownNumbers, unverified } from '../lib/numberCheck.js';

let bad = 0;
const check = (n, c, x = '') => { console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${x ? ' -> ' + x : ''}`); if (!c) bad++; };
const cfg = JSON.parse(readFileSync(new URL('../knowledge/liquidation-config.json', import.meta.url), 'utf8'));
const D = defaultSettings(cfg);

check('defaults come from knowledge/liquidation-config.json: 60 days, top 20, b2c, 30-day sales, no min DOI, rank by excess value', D.cover_days === 60 && D.top_n === 20 && D.channel === 'b2c' && D.sales_days === 30 && D.min_doi === null && D.rank_by === 'excess_value');
check('default exclusions: Spare Parts, Covers (+ the sub-category Joystick Cover AC-FNN01, no name-word rule); high-value group Mobility, Ergo Furniture', D.exclude_categories.includes('Spare Parts') && D.exclude_categories.includes('Covers') && D.exclude_sub_categories.includes('Joystick Cover AC-FNN01') && D.exclude_words.length === 0 && D.high_value_categories.join() === 'Mobility,Ergo Furniture');
const m1 = mergeSettings(D, { cover_days: 90, rank_by: 'doi', sales_days: 60 }, { top_n: 10, exclude_categories: ['Footwear'] });
check('every setting can change: cover days, top N, rank, sales period (60 works), exclusions replaced', m1.settings.cover_days === 90 && m1.settings.top_n === 10 && m1.settings.rank_by === 'doi' && m1.settings.sales_days === 60 && m1.settings.exclude_categories.join() === 'Footwear' && m1.notes.length === 0);
const m2 = mergeSettings(D, { sales_days: 45, cover_days: 0, channel: 'x', rank_by: 'nonsense' });
check('invalid values are ignored and reported, never crash', m2.settings.sales_days === 30 && m2.settings.cover_days === 60 && m2.notes.length === 4);
const line = settingsLine(m1.settings);
const back = parseSettingsLine(`Here you go.\n**${line}**\nok`);
check('the Settings line survives a round trip through the chat text', back && back.cover_days === '90' && back.exclude_categories[0] === 'Footwear' && back.high_value_categories.join() === 'Mobility,Ergo Furniture');
const chat = settingsFromChat([{ role: 'user', content: 'q' }, { role: 'assistant', content: 'plan\n' + settingsLine(D) }, { role: 'user', content: 'now 90 days cover' }]);
check('settings from the last assistant message of the chat are remembered for follow-ups ("now 90 days cover")', mergeSettings(D, chat, { cover_days: 90 }).settings.cover_days === 90 && mergeSettings(D, chat).settings.top_n === 20);
check('the chat settings keep earlier changes when only one thing changes', mergeSettings(D, settingsFromChat([{ role: 'assistant', content: settingsLine(m1.settings) }]), { cover_days: 45 }).settings.rank_by === 'doi');

// ── fixture ──
const sku = (code, cat, sub, stock, avg30, extra = {}) => ({ sku: code, skuKey: code, category: cat, subCategory: sub, facilities: [{ facilityType: 'Regular', totalInvt: stock }, { facilityType: 'Dark Store', totalInvt: 999 }], avgSale: avg30, totalAvgSale: avg30 + 1, lastSaleDate: 'last' in extra ? extra.last : '2026-11-20' });
const f30 = { asOf: '2026-11-27T05:00:00Z', avgSaleWindowDays: 30, skus: [
  sku('F1', 'Footwear', 'Slipper', 1000, 10),
  sku('F2', 'Footwear', 'Slipper', 500, 5),
  sku('F3', 'Footwear', 'Slipper', 100, 0, { last: '2026-08-30' }),
  sku('O1', 'Orthotics', 'Brace', 300, 10),
  sku('M1', 'Mobility', 'Walker', 400, 2),
  sku('E1', 'Ergo Furniture', 'Chair', 100, 1),
  sku('C1', 'Covers', 'Seat Cover', 900, 1),
  sku('P1', 'Orthotics', 'Mattress Topper Cover', 500, 1),
  sku('S1', 'Spare Parts', 'Wheel', 50, 0),
  sku('J1', 'Accessories', 'Joystick Cover AC-FNN01', 45, 1),
  sku('N1', 'Footwear', 'Slipper', 700, 0, { last: null }),
  sku('X1', 'Footwear', 'Mystery', 300, 2),
] };
const f7 = { asOf: f30.asOf, avgSaleWindowDays: 7, skus: f30.skus.map(s => ({ ...s, avgSale: s.sku === 'F1' ? 20 : s.avgSale })) };
const cogs = buildCogs([['F1', 'Slipper', 100], ['F2', 'Slipper', 100], ['F3', 'Slipper', 100], ['O1', 'Brace', 50], ['M1', 'Walker', 1000], ['E1', 'Chair', 2000], ['C1', 'Seat Cover', 10]].map(([code, sub, c]) => ({ sku: code, month: '2026-11-01', cogs: c, subCategory: sub, carriedFromMonth: '2026-09-01' })));
const S = (u90, u60, asp, last) => ({ units90: u90, units60: u60, revExc90: u90 * asp, revInc90: u90 * asp * 1.12, lastOrder: last });
const sales = new Map([['F1', S(900, 600, 250, '2026-11-26')], ['F2', S(450, 300, 200, '2026-11-26')], ['M1', S(180, 120, 900, '2026-11-25')], ['E1', S(90, 60, 1500, '2026-11-25')], ['F3', S(5, 0, 100, '2026-08-30')], ['O1', S(900, 600, 120, '2026-11-26')], ['X1', S(180, 120, 300, '2026-11-26')]]);
const run = (settings, over = {}) => analyse({ files: { 7: f7, 30: f30 }, sales, firstSale: new Set(), cogs, settings, ...over });
const res = run(D);
const slip = res.main.find(s => s.sub_category === 'Slipper');

check('stock = Regular facilities only (Dark Store 999 ignored): Slipper 1,000 + 500 + 100 = 1,600', slip && slip.stock_units === 1600);
check('excess = stock - 60 x avg sale, minimum 0: 400 + 200 + 100 = 700 units (Brace has none)', slip.excess_units === 700 && !res.main.some(s => s.sub_category === 'Brace'));
check('excess value = excess x COGS per unit: 700 x 100 = 70,000', slip.excess_value === 70000);
check('DOI of a sub-category = floor(stock / total avg sale) = floor(1600 / 15) = 106', slip.doi === 106);
check('never-live (never sold) SKU is excluded and counted: N1, 700 units', res.excluded.never.skus === 1 && res.excluded.never.units === 700 && res.excluded.never.list[0] === 'N1');
check('covers and spare parts are excluded and listed by exact name', ['Covers', 'Spare Parts', 'Joystick Cover AC-FNN01'].every(n => res.excluded.names.some(e => e.name === n)), res.excluded.names.map(e => e.name).join(', '));
check('a product with Cover in its name (Mattress Topper Cover) stays in: no name-word rule', res.out.some(s => s.sub_category === 'Mattress Topper Cover'));
check('excluded names are not in any ranking', ![...res.main, ...res.high].some(s => ['Seat Cover', 'Wheel', 'Joystick Cover AC-FNN01'].includes(s.sub_category)));
check('mobility and ergo furniture are a separate list, not mixed into the main one', res.high.map(s => s.sub_category).join() === 'Walker,Chair' && !res.main.some(s => ['Walker', 'Chair'].includes(s.sub_category)));
check('walker excess = 400 - 120 = 280 units, value 280,000', res.high[0].excess_units === 280 && res.high[0].excess_value === 280000);
check('SKU with stock but no COGS is NOT dropped: separate "No COGS" list ranked by excess units, flagged', res.noCogs.map(r => r.sku).join() === 'P1,X1' && res.noCogs[1].excess_units === 180 && res.noCogs[1].cogs_basis === 'No COGS' && res.noCogs[1].stock_value === null);
check('...and kept out of the value ranking', !res.main.some(s => s.sub_category === 'Mystery'));
check('trend 7d vs 30d is calculated: Slipper avg 7d (20+5+0) vs 30d (10+5+0) = +66.7%', slip.trend_7d_vs_30d_pct === 66.7, String(slip.trend_7d_vs_30d_pct));
check('per SKU: ASP ex GST = revenue / units = 250; margin = ASP - COGS = 150; max discount = 150 / 250 = 60%', (() => { const r = res.out.find(x => x.sku === 'F1'); return r.asp_exc_gst === 250 && r.margin_per_unit === 150 && r.max_discount_pct === 60; })());
check('sub-category ASP is weighted by units sold: (900x250 + 450x200 + 5x100) / 1355 = 232.8; max discount before loss = (232.8 - 100) / 232.8 = 57.1%', slip.asp_exc_gst > 232.7 && slip.asp_exc_gst < 232.9 && slip.max_discount_pct === 57.1, `${slip.asp_exc_gst?.toFixed(1)} / ${slip.max_discount_pct}`);
check('a SKU with no sale row has "ASP n/a" marked, never a made-up price', res.out.every(r => r.asp_exc_gst !== null || /n\/a/.test(r.price_note)));
const noSale = run(D, { sales: new Map(), firstSale: new Set(['F1', 'F2', 'F3', 'M1', 'E1', 'O1', 'X1']) });
check('...a SKU sold before but not in 90 days: kept, "ASP n/a (no sale in 90 days)"', noSale.main.find(s => s.sub_category === 'Slipper').price_note.includes('n/a') && noSale.out.find(x => x.sku === 'F1').price_note.includes('n/a'));
check('a SKU with a first-sale date but no recent sale is not "never live"', noSale.excluded.never.skus === 1);

// settings change the result
const c90 = run(mergeSettings(D, { cover_days: 90 }).settings);
check('now 90 days cover: excess falls', c90.main.find(s => s.sub_category === 'Slipper').excess_units < slip.excess_units);
const noEx = run(mergeSettings(D, { exclude_categories: [], exclude_sub_categories: [] }).settings);
check('removing the exclusions brings Covers back', noEx.main.some(s => s.sub_category === 'Seat Cover') && noEx.excluded.names.length === 0);
const minDoi = run(mergeSettings(D, { min_doi: 150 }).settings);
check('minimum DOI keeps only slow SKUs (F1/F2 at DOI 100 dropped)', minDoi.out.every(r => r.doi === null || r.doi >= 150));
const inc = run(mergeSettings(D, { include_categories: ['Footwear'], high_value_categories: [] }).settings);
check('include only a category + no separate group', inc.main.every(s => s.category === 'Footwear') && inc.high.length === 0);
const d60 = run(mergeSettings(D, { sales_days: 60 }).settings);
check('60-day average uses units / 60 from the sales table (F1: 600/60 = 10)', d60.out.find(x => x.sku === 'F1').avg_sale_used === 10);

// text for the model
const ctx = { asOf: f30.asOf, cogsLabel: 'COGS rates: Sep 2026, carried forward' };
const plan = planText(res, ctx);
check('the plan lists settings with defaults, exclusions by exact name, the high-value group and asks to confirm', /cover_days 60/.test(plan) && /Covers/.test(plan) && /Spare Parts/.test(plan) && /Joystick Cover AC-FNN01/.test(plan) && /never-live/.test(plan) && /Mobility, Ergo Furniture/.test(plan) && /Shall I run it with these settings\?/.test(plan) && /No COGS/.test(plan));
const text = resultText(res, { ...ctx, attached: true });
check('the result has the main list, the separate high-value list, the No COGS list, ASP / margin / max discount, a TOTAL row and the Settings line', /MAIN LIST/.test(text) && /HIGH-VALUE LIST/.test(text) && /NO COGS LIST/.test(text) && /max_discount_pct/.test(text) && /TOTAL of all/.test(text) && /^Settings: /m.test(text) && /ATTACHED/.test(text));
const k = knownNumbers([text, plan]);
check('numbers copied from the tool pass the number check; a model-made one is caught', unverified('Slipper excess value ₹70,000 and 700 units', k).length === 0 && unverified('Slipper excess value ₹71,000', k).length === 1);

// Excel
const wbf = await buildWorkbook(res, ctx, XLSX);
const wb = XLSX.read(Buffer.from(wbf.data, 'base64'), { type: 'buffer' });
check('Excel: settings & exclusions, sub-category summary, high-value summary, All SKUs, No COGS SKUs, Never-live SKUs sheets', ['Settings & exclusions', 'Sub-category summary', 'High-value summary', 'All SKUs', 'No COGS SKUs', 'Never-live SKUs'].every(n => wb.SheetNames.includes(n)), wb.SheetNames.join(' | '));
const skuSheet = XLSX.utils.sheet_to_json(wb.Sheets['All SKUs']);
check('Excel All SKUs has every included SKU and every column', skuSheet.length === res.out.length && ['SKU', 'Stock (Regular, units)', 'Stock value at cost', 'Avg daily sale 30d', 'Avg daily sale 90d', 'DOI (days)', 'Last sale date', 'Ever sold', 'Excess units', 'Excess value at cost', 'ASP ex GST (90d, after discounts)', 'Margin per unit (ASP - COGS)', 'Max discount before loss %'].every(c => c in skuSheet[0]));
check('Excel sub-category sheet carries weighted ASP, margin and max discount', 'ASP ex GST (weighted)' in XLSX.utils.sheet_to_json(wb.Sheets['Sub-category summary'])[0]);

// source and safety
const src = readFileSync(new URL('../lib/inventoryOpportunity.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '').replace(SALES_SQL, '');
check('read-only: the module only reads (no insert / update / delete / upsert)', !/\b(insert|upsert|delete|update)\b/i.test(src));
check('the sales query is a plain SELECT on the consumer sales table', /^\s*SELECT/i.test(SALES_SQL) && !/\b(INSERT|UPDATE|DELETE|DROP)\b/i.test(SALES_SQL));
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
check('the tool is gated by the inventory:cost permission (checkInventoryCost) and the dispatch is wired', /async function executeInventoryOpportunity[\s\S]{0,400}checkInventoryCost\(user\)/.test(server) && /name: 'inventory_opportunity'/.test(server) && /executeInventoryOpportunity\(user, block\.input/.test(server));
console.log(bad ? `\n${bad} failed` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
