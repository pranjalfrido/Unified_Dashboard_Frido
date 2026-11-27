// Liquidation flow: plan / run / follow-up are built in code; permission refused before any model call; all three result parts shown.
import { readFileSync } from 'fs';
import { buildCogs } from '../lib/inventoryCost.js';
import { analyse, defaultSettings, mergeSettings, settingsLine, settingsFromChat, resultText, resolveNames } from '../lib/inventoryOpportunity.js';
import { detectFlow, preflightDenial, planMarkdown, resultMarkdown, parseSettingChange, classifyFollowUp, answerQuestion, phoneHints, settingsPlain, ASK_LINE } from '../lib/liquidationFlow.js';
import { parseHidden, flowMessageFromChat } from '../lib/inventoryOpportunity.js';
import { phoneColumns } from '../../src/ask/phoneColumns.js';
import { stripHidden } from '../../src/ask/markdown.js';
import { knownNumbers, unverified } from '../lib/numberCheck.js';

let bad = 0;
const check = (n, c, x = '') => { console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${x ? ' -> ' + x : ''}`); if (!c) bad++; };
const cfg = JSON.parse(readFileSync(new URL('../knowledge/liquidation-config.json', import.meta.url), 'utf8'));
const D = defaultSettings(cfg);

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
  sku('S2', 'Orthotics', 'Spare Strap Kit', 40, 0),
  sku('N1', 'Footwear', 'Slipper', 700, 0, { last: null }),
  sku('X1', 'Footwear', 'Mystery', 300, 2),
] };
const f7 = { asOf: f30.asOf, avgSaleWindowDays: 7, skus: f30.skus.map(s => ({ ...s, avgSale: s.sku === 'F1' ? 20 : s.avgSale })) };
const cogs = buildCogs([['F1', 'Slipper', 100], ['F2', 'Slipper', 100], ['F3', 'Slipper', 100], ['O1', 'Brace', 50], ['M1', 'Walker', 1000], ['E1', 'Chair', 2000], ['C1', 'Seat Cover', 10]].map(([code, sub, c]) => ({ sku: code, month: '2026-11-01', cogs: c, subCategory: sub, carriedFromMonth: '2026-09-01' })));
const S = (u90, u60, asp, last) => ({ units90: u90, units60: u60, revExc90: u90 * asp, revInc90: u90 * asp * 1.12, lastOrder: last });
const sales = new Map([['F1', S(900, 600, 250, '2026-11-26')], ['F2', S(450, 300, 200, '2026-11-26')], ['M1', S(180, 120, 900, '2026-11-25')], ['E1', S(90, 60, 1500, '2026-11-25')], ['F3', S(5, 0, 100, '2026-08-30')], ['O1', S(900, 600, 120, '2026-11-26')], ['X1', S(180, 120, 300, '2026-11-26')], ['S2', S(10, 5, 50, '2026-11-01')]]);
const run = (settings, over = {}) => analyse({ files: { 7: f7, 30: f30 }, sales, firstSale: new Set(), cogs, settings, ...over });
const res = run(D);
const ctx = { asOf: '2026-11-27T09:04:00', cogsLabel: 'COGS rates: Sep 2026, carried forward' };

check('no name-word rule: only the categories Covers / Spare Parts and the sub-category Joystick Cover AC-FNN01 are excluded', D.exclude_words.length === 0 && D.exclude_categories.join() === 'Spare Parts,Covers' && D.exclude_sub_categories.join() === 'Joystick Cover AC-FNN01');
check('Mattress Topper Cover and Spare Strap Kit stay in (real products); the Joystick Cover is excluded', res.out.some(x => x.sub_category === 'Mattress Topper Cover') && res.excluded.names.some(e => e.name === 'Joystick Cover AC-FNN01') && !res.excluded.names.some(e => /Topper|Strap/.test(e.name)));

const plan = planMarkdown(res, ctx);
check('plan: settings, exclusions (count + names), the question, the Settings line', /Cover days: \*\*60\*\*/.test(plan) && /Never-live.*1 SKU,/.test(plan) && /Covers/.test(plan) && /Spare Parts/.test(plan) && /Joystick Cover AC-FNN01/.test(plan) && !/Mattress Topper/.test(plan) && /Shall I run it with these settings\?/.test(plan) && /^Settings: /m.test(plan));
check('plan is short (under 2,800 characters here)', plan.length < 2800, String(plan.length));

const result = resultMarkdown(res, ctx, { attached: true });
check('result shows all three parts: main top list, high-value top list, No COGS top list', /### Top \d+ of \d+ sub-categories/.test(result) && /### High-value: Mobility \/ Ergo Furniture/.test(result) && /### No COGS \(not valued\)/.test(result));
check('each part says "Full list in Excel"', (result.match(/Full list in Excel\./g) || []).length === 3);
const manyHigh = { ...res, high: Array.from({ length: 9 }, (_, i) => ({ ...res.high[0], sub_category: `H${i}` })), noCogs: Array.from({ length: 9 }, (_, i) => ({ ...res.noCogs[0], sku: `N${i}` })) };
const rb = resultMarkdown(manyHigh, ctx, {});
check('9 high-value sub-categories -> 5 rows + total; 9 No COGS SKUs -> 5 rows + total', (rb.split('### High-value')[1].split('###')[0].match(/^\| H\d/gm) || []).length === 5 && (rb.split('### No COGS')[1].split('Full list')[0].match(/^\| N\d/gm) || []).length === 5);
check('result ends with the Settings line in plain words and mentions the attached Excel', /^Settings: 60 days cover · B2C sales, last 30 days · ranked by excess value · top 20 · excluded: Spare Parts, Covers, Joystick Cover AC-FNN01 · high-value list: Mobility, Ergo Furniture$/m.test(result) && /Excel is attached/.test(result));
check('the visible Settings line has no raw keys', !/sales_days=|rank_by=|exclude_categories=|\|/.test(settingsPlain(res.settings)));
check('the machine-readable settings are hidden in a comment and removed by the screen (stripHidden)', /<!--nx:/.test(result) && !/<!--nx:|"cover_days"/.test(stripHidden(result)) && parseHidden(result)?.s.cover_days === 60);
check('result is compact (under 4,500 characters for this fixture)', result.length < 4500, String(result.length));
check('ASP, margin, max discount are in the main table', /\| Slipper[^\n]*₹\d+ \| ₹\d+ \| 57\.1% \|/.test(result), (result.match(/\| Slipper[^\n]*/) || [''])[0]);
const odd = unverified(stripHidden(result), knownNumbers([resultText(res, { ...ctx, attached: true })]));
check('every number of the code-built answer is also in the tool result (the number check would pass)', odd.length === 0, odd.join(' '));

const A = t => ({ role: 'assistant', content: t });
const U = t => ({ role: 'user', content: t });
check('the exact question -> plan first', detectFlow([U('top 20 products where inventory is high enough to push for sale / liquidate high-DOI products; ignore never-live products; keep mobility and ergo furniture separate; Excel with full SKU details; ask me questions before starting')])?.mode === 'plan');
check('"which slow-moving products should we liquidate" -> plan first', detectFlow([U('which slow-moving products should we liquidate')])?.mode === 'plan');
check('"yes, run it" after the plan -> run; no model needed to read settings', (() => { const f = detectFlow([U('liquidate high doi'), A(plan), U('Yes, run it with these settings')]); return f?.mode === 'run' && f.parse === false; })());
check('"now 90 days cover" and a question both go to the follow-up classifier', detectFlow([U('x liquidate'), A(plan), U('yes'), A(result), U('now show 90 days cover')])?.mode === 'followup' && detectFlow([U('x liquidate'), A(plan), U('yes'), A(result), U('Trend 30 vs 90 days is what?')])?.mode === 'followup');
check('"ok" after a result is an acknowledgement, not a re-run', detectFlow([U('x liquidate'), A(plan), U('yes'), A(result), U('ok')])?.mode === 'ack');
check('"yes" after a RESULT is not a confirmation of the plan', detectFlow([U('x liquidate'), A(plan), U('yes'), A(result), U('yes')])?.mode !== 'run');
check('a message after an explanation is still in the flow (settings carried from the result)', detectFlow([U('x liquidate'), A(plan), U('yes'), A(result), U('why is slippers on top?'), A('Because the list is ranked by excess value.'), U('now 90 days cover')])?.mode === 'followup');
check('"run it now, no questions" in the first message -> run at once', detectFlow([U('liquidate slow-moving stock, run it now with defaults')])?.mode === 'run');
check('normal questions and "Plan N days" are not a flow', detectFlow([U('What is the total inventory value right now?')]) === null && detectFlow([U('Top 5 products by inventory value')]) === null && detectFlow([U('Plan 40 days for FR-OPC-L1')]) === null);
check('the chat remembers the settings from the Settings line', settingsFromChat([A(result)])?.cover_days === 60);
check('a follow-up keeps earlier changes', mergeSettings(D, settingsFromChat([A(settingsLine(mergeSettings(D, { rank_by: 'doi' }).settings))]), { cover_days: 90 }).settings.rank_by === 'doi');

const no = { access: { isAdmin: false, tabs: ['sales:shopify'] } }, yes = { access: { isAdmin: false, tabs: ['inventory:cost'] } }, adm = { access: { isAdmin: true, tabs: [] } };
const fl = { mode: 'plan', parse: false };
check('liquidation without inventory:cost is refused in code (no model call)', /have access/.test(preflightDenial(no, 'liquidate', fl) || ''));
check('...with inventory:cost, or as admin, it is not refused', preflightDenial(yes, 'liquidate', fl) === null && preflightDenial(adm, 'liquidate', fl) === null);
check('an inventory value question without the permission is refused; with it, allowed', preflightDenial(no, 'What is the total inventory value right now?', null) !== null && preflightDenial(yes, 'What is the total inventory value right now?', null) === null);
check('OOS loss and CN questions check their own permission', preflightDenial(no, 'OOS loss last week', null) !== null && preflightDenial({ access: { isAdmin: false, tabs: ['inventory'] } }, 'OOS loss last week', null) === null && preflightDenial(no, 'CN received by reason Sep 2026', null) !== null);
check('an ordinary sales question is never pre-refused', preflightDenial(no, 'What was D2C gross revenue in Oct?', null) === null);
check('an MCP call (no access object) is not refused here', preflightDenial({}, 'liquidate', fl) === null);

const names = { cats: ['Footwear', 'Orthotics', 'Pillows', 'Covers', 'Spare Parts'], subs: ['Travel Neck Pillow Without Case', 'Latex Pillow with Cooling Cover', 'Slipper'] };
const rn = resolveNames({ ...D, exclude_categories: ['pillows', 'Covers'], exclude_sub_categories: ['neck pillow', 'nothing here'] }, names, cfg);
check('"pillows" = the category; "neck pillow" = the sub-category containing it; an unknown name is reported, not guessed', rn.settings.exclude_categories.join() === 'Pillows,Covers' && rn.settings.exclude_sub_categories.join() === 'Travel Neck Pillow Without Case' && rn.notes.some(n => /nothing here/.test(n)), JSON.stringify(rn));
check('default exclusions that exist in the data raise no notes', resolveNames(D, names, cfg).notes.length === 0);

const fake = input => ({ messages: { create: async () => ({ content: [{ type: 'tool_use', input }], usage: {} }) } });
const q1 = 'liquidate high-DOI products; ignore never-live; keep mobility separate; ask me questions before starting';
check('a model slip is guarded: "high-DOI products" is the topic, not rank_by / min_doi', (await parseSettingChange(fake({ rank_by: 'doi', min_doi: 60, cover_days: 60 }), 'm', q1, D)).args.rank_by === undefined && (await parseSettingChange(fake({ rank_by: 'doi', min_doi: 60 }), 'm', q1, D)).args.min_doi === undefined);
check('an explicit instruction still passes: "rank by DOI", "minimum DOI 90"', (await parseSettingChange(fake({ rank_by: 'doi', min_doi: 90 }), 'm', 'now rank by DOI, minimum DOI 90', D)).args.rank_by === 'doi' && (await parseSettingChange(fake({ min_doi: 90 }), 'm', 'minimum DOI 90', D)).args.min_doi === 90);

// follow-up classifier and explanation (fake model)
const fakeTool = input => ({ messages: { create: async () => ({ content: [{ type: 'tool_use', input }], usage: { input_tokens: 900, output_tokens: 40 } }) } });
const ck = (input, text) => classifyFollowUp(fakeTool(input), 'm', text, D, 'result');
const r1 = await ck({ kind: 'change', settings: { cover_days: 90 } }, 'now 90 days cover');
check('classifier: "now 90 days cover" -> change, with the new setting', r1.kind === 'change' && r1.args.cover_days === 90);
const r2 = await ck({ kind: 'question' }, 'what does trend 30 vs 90 mean?');
check('classifier: a question about the result -> question, no settings', r2.kind === 'question' && Object.keys(r2.args).length === 0);
const r3 = await ck({ kind: 'change', settings: { rank_by: 'doi' } }, 'which of these is high-DOI?');
check('a model slip is guarded: rank_by dropped when the user did not say rank / sort', r3.args.rank_by === undefined);
check('an unknown kind falls back to "unclear" (one line asks which)', (await ck({ kind: 'banana' }, 'hmm')).kind === 'unclear' && /re-run/.test(ASK_LINE));
const hid = parseHidden(result);
const ctxQ = { text: result, hidden: hid };
const fakeText = text => ({ messages: { create: async () => ({ content: [{ type: 'text', text }], usage: { input_tokens: 5000, output_tokens: 150 } }) } });
const g = hid.r.main[0];
const ok = await answerQuestion(fakeText(`Trend compares the last 30 days with the last 90 days. ${g.n}: 30d ${g.per_day_30d}/day vs 90d ${g.per_day_90d}/day.`), 'm', 'what does trend mean?', ctxQ);
check('explanation with numbers from the result passes the number check', ok.text.includes(String(g.per_day_30d)), ok.text);
const bad2 = await answerQuestion(fakeText('Slipper sells 999,999 units a day.\nIt is on top because the list is ranked by excess value.'), 'm', 'why on top?', ctxQ);
check('an invented number is removed (its line is dropped), never shown', !/999,999/.test(bad2.text) && /excess value/.test(bad2.text), bad2.text);
check('the hidden state carries the 30d / 90d per-day sale and trend of every listed sub-category (explanations need no re-run)', hid.r.main.every(x => 'per_day_30d' in x && 'per_day_90d' in x && 'trend_30d_90d' in x) && hid.r.totals.main_subs >= 1);

// phone columns
const hints = phoneHints(result, res.settings);
check('phone hints: sub-category tables -> key Excess value, show Excess value / Excess units / Trend; No COGS table -> Excess units', hints.length === 3 && hints[0].key === 'Excess value' && hints[0].show.join() === 'Excess value,Excess units,Trend 30d vs 90d' && hints[2].key === 'Excess units');
check('ranked by DOI -> the key column is DOI', phoneHints(result, { ...res.settings, rank_by: 'doi' })[0].key === 'DOI' && phoneHints(result, { ...res.settings, rank_by: 'doi' })[0].show[0] === 'DOI');
const mt = result.split('\n').filter(l => /^\|/.test(l))[0].split('|').map(c => c.trim()).filter(Boolean);
const cols = phoneColumns(mt, mt.map((_, j) => j > 0), hints[0]);
check('phone shows exactly: sub-category, excess value, excess units, trend; stock and stock value stay in "View full table"', cols.map(j => mt[j]).join(' / ') === 'Sub-category / Excess value / Excess units / Trend 30d vs 90d', cols.map(j => mt[j]).join(' / '));
check('a plain string key still works as before (other answers unchanged)', phoneColumns(mt, mt.map((_, j) => j > 0), 'Excess value').length >= 2);
check('flow message lookup: plan, then result', flowMessageFromChat([A(plan)])?.kind === 'plan' && flowMessageFromChat([A(plan), A(result)])?.kind === 'result');

console.log(bad ? `\n${bad} failed` : '\nAll checks passed'); process.exit(bad ? 1 : 0);
