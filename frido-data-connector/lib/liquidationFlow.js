// The liquidation / push-for-sale analysis runs without a writing model: the plan and the result are built here from the tool's own
// numbers, so every figure is exact and an answer costs almost nothing. A model (Sonnet) is used only for one tiny call that turns a
// free-text settings change ("now 90 days cover, exclude pillows") into settings.
//   detectFlow(messages)            -> { mode: 'plan' | 'run', parse: boolean } or null (not a liquidation question: normal path)
//   preflightDenial(user, text, f)  -> refusal text (no model call) when the person lacks the permission the question needs, else null
//   planMarkdown / resultMarkdown   -> the answer texts
//   parseSettingChange(client, ...) -> { args, usage }
import { indianInt, formatRupees } from './format.js';
import { settingsLine, hiddenState, flowMessageFromChat } from './inventoryOpportunity.js';
import { checkInventoryCost, checkOos, checkCn } from './pageAccess.js';
import { knownNumbers, unverified } from './numberCheck.js';
import { findTables, plain } from './tableHints.js';

export const HIGH_TOP = 5, NOCOGS_TOP = 5;
const TOPIC = /liquidat|push (it |them )?for sale|slow.?moving|high.?doi|dead stock|excess stock|clear(ing)? (the )?(excess |slow |old )?stock/i;
export const isLiquidationTopic = q => TOPIC.test(String(q || ''));
const RUN_NOW = /\b(run it now|no questions|don'?t ask|do not ask|without (asking|questions)|skip (the )?questions|just run|go ahead and run|with (the )?defaults)\b/i;
const CONFIRM = /^\s*(yes|yeah|yep|yup|y|ok|okay|sure|go ahead|go|run it|run|proceed|confirmed?|do it|haan|ha|looks good|go for it|please run it)\b(?:[\s,.!]*(?:please|run it|with (?:these|the same|those) settings|go ahead|now))*[\s.!]*$/i;
const ACK = /^\s*(ok(ay)?|thanks?|thank you|got it|great|nice|cool|fine|perfect|noted|done)[\s.!]*$/i;
const CHANGE = /cover|top\s*\d+|\b\d+\s*(skus?|sub.?categor)|rank|sort|\bdoi\b|excess value|stock value|sales (period|days|average)|\b(7|15|30|60|90)\s*-?\s*(day|days|d)\b|channel|b2c|all channels|exclude|include|only|ignore|without|high.?value|instead|change|set |now |also |remove|add /i;

const textOf = m => String(m?.content ?? m?.text ?? '');

// What the last user message is, in the liquidation flow:
//   { mode: 'plan' | 'run', parse }   a new request (plan first unless "run it now"), or "yes" after the plan
//   { mode: 'followup' }              a message after a plan / result of this chat: the classifier decides (settings change -> re-run,
//                                     a question about the result -> explain, unclear -> one-line question, unrelated -> normal path)
//   { mode: 'ack' }                   "ok" / "thanks" after a result
//   null                              not a liquidation message
export function detectFlow(messages) {
  const msgs = Array.isArray(messages) ? messages : [];
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== 'user' || (Array.isArray(last.attachments) && last.attachments.length)) return null;
  const q = textOf(last);
  const prior = flowMessageFromChat(msgs.slice(0, -1));
  if (prior) {
    const lastAssistant = [...msgs.slice(0, -1)].reverse().find(m => m.role === 'assistant');
    const justAfterPlan = prior.kind === 'plan' && lastAssistant && textOf(lastAssistant) === prior.text;
    if (justAfterPlan && CONFIRM.test(q) && q.length < 80) return { mode: 'run', parse: false };
    if (!justAfterPlan && ACK.test(q) && lastAssistant && textOf(lastAssistant) === prior.text) return { mode: 'ack' };
    if (q.length < 500) return { mode: 'followup' };
    return null;
  }
  if (TOPIC.test(q)) return { mode: RUN_NOW.test(q) ? 'run' : 'plan', parse: CHANGE.test(q) };
  return null;
}

// A question that needs a permission is refused here, before any model call (cost 0). Same checks the tools make.
export function preflightDenial(user, text, flow) {
  const q = String(text || '');
  let r = { ok: true };
  if (flow) r = checkInventoryCost(user);
  else if (/inventory (value|cost)|value of (the |our )?inventory|stock value|inventory valuation|valued at cost/i.test(q)) r = checkInventoryCost(user);
  else if (/\boos loss|out.of.stock loss|loss(es)? (from|due to) (oos|out.of.stock)/i.test(q)) r = checkOos(user);
  else if (/\bcredit notes?\b|\bcn received\b/i.test(q)) r = checkCn(user);
  return r.ok ? null : r.text;
}

const pct = v => (v == null ? 'n/a' : `${v > 0 ? '+' : ''}${v}%`);
const rs = v => (v == null ? 'n/a' : `₹${indianInt(Math.round(v))}`);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const istTime = iso => { const d = new Date(iso); if (!iso || Number.isNaN(d.getTime())) return 'n/a'; const t = new Date(d.getTime() + 5.5 * 3600e3); return `${t.getUTCDate()} ${MON[t.getUTCMonth()]} ${t.getUTCFullYear()} ${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')} IST`; };
const skuWord = n => `${indianInt(n)} SKU${n === 1 ? '' : 's'}`;
const doiTxt = v => (v == null ? 'n/a' : indianInt(v));
const cell = v => String(v ?? '').replace(/\|/g, '/');
const RANK_LABEL = { excess_value: 'excess value', doi: 'DOI', stock_value: 'stock value' };
const avgBasis = s => `${s.channel === 'all' ? 'all-channel' : 'B2C'} sales, last ${s.sales_days} days`;

function exclusionLines(res) {
  const ex = res.excluded, by = k => ex.names.filter(e => e.kind === k);
  const fmt = e => `${e.name} (${skuWord(e.skus)}, ${indianInt(e.units)} units)`;
  const lines = [`- Never-live (never sold): ${skuWord(ex.never.skus)}, ${indianInt(ex.never.units)} units`];
  const cats = by('category'); if (cats.length) lines.push(`- Categories: ${cats.map(fmt).join('; ')}`);
  const words = ex.names.filter(e => e.kind.startsWith('sub-category name contains'));
  if (words.length) { lines.push('- Sub-categories excluded by name:'); for (const e of words) lines.push(`  - ${fmt(e)} [${e.kind.replace('sub-category name contains ', 'has ')}]`); }
  for (const k of [...new Set(ex.names.map(e => e.kind))].filter(k => k !== 'category' && !k.startsWith('sub-category name contains'))) lines.push(`- ${k}: ${by(k).slice(0, 25).map(fmt).join('; ')}`);
  return lines;
}

export function planMarkdown(res, ctx, notes = []) {
  const s = res.settings, c = res.counts;
  const lines = [
    '**Plan: stock to push for sale / liquidate** (nothing has been run yet)',
    '',
    '**Settings (defaults, tell me to change any)**',
    `- Cover days: **${s.cover_days}** (excess = stock beyond ${s.cover_days} days of average daily sale)`,
    `- Sales average: ${avgBasis(s)} · top ${s.top_n} sub-categories · ranked by ${RANK_LABEL[s.rank_by]} · minimum DOI: ${s.min_doi ?? 'none'}`,
    `- Separate high-value list: ${s.high_value_categories.join(', ') || 'none'}`,
    '- Price: average selling price (B2C, last 90 days, after discounts), margin = ASP − COGS, max discount before loss = margin ÷ ASP',
    `- Stock: Regular facilities as of ${istTime(ctx.asOf)} · valued at cost (${ctx.cogsLabel})`,
    '',
    '**Excluded**',
    ...exclusionLines(res),
    '',
    `**Not valued:** ${skuWord(c.noCogsSkus)} (${indianInt(c.noCogsUnits)} units) have no COGS. They are not dropped: a separate list ranked by excess units, flagged "No COGS".`,
    `**Included:** ${skuWord(c.included)} in ${indianInt(c.subCategories)} sub-categories · ${indianInt(c.includedUnits)} units · ${formatRupees(c.includedValue)} · ${indianInt(c.withExcess)} sub-categories have excess at ${s.cover_days} days of cover.`,
    '',
    'You can change: cover days, top N, B2C / all channels, sales period (7, 15, 30, 60, 90 days), minimum DOI, rank by (excess value / DOI / stock value), include or exclude any category or sub-category by name, the high-value group.',
    '',
    ...(notes.length ? [`Note: ${notes.join('; ')}.`, ''] : []),
    '**Shall I run it with these settings?**',
    '',
    settingsPlain(s),
    hiddenState('plan', s),
  ];
  return lines.join('\n');
}

// "Settings: 60 days cover · B2C sales, last 30 days · ranked by excess value · top 20 · excluded: Covers, Spare Parts · high-value list: Mobility, Ergo Furniture"
export function settingsPlain(s) {
  const ex = [...s.exclude_categories, ...s.exclude_sub_categories, ...s.exclude_words.map(w => `names containing "${w}"`)];
  const parts = [`${s.cover_days} days cover`, avgBasis(s), `ranked by ${RANK_LABEL[s.rank_by]}`, `top ${s.top_n}`];
  if (s.min_doi != null) parts.push(`minimum DOI ${s.min_doi}`);
  if (s.include_categories.length || s.include_sub_categories.length) parts.push(`only: ${[...s.include_categories, ...s.include_sub_categories].join(', ')}`);
  parts.push(`excluded: ${ex.length ? ex.join(', ') : 'none'}`, `high-value list: ${s.high_value_categories.join(', ') || 'none'}`);
  return `Settings: ${parts.join(' · ')}`;
}

// The figures behind the lists shown (for questions about the result, no re-run): per row the numbers a person may ask about.
const r1v = v => (v == null ? null : Math.round(v * 10) / 10);
const compactSub = e => ({ n: e.sub_category, cat: e.category, skus: e.skus, stock: e.stock_units, stock_value: Math.round(e.stock_value || 0), excess_units: e.excess_units, excess_value: Math.round(e.excess_value || 0), doi: e.doi, per_day_used: r1v(e.avg_used), per_day_30d: r1v(e.avg30), per_day_7d: r1v(e.avg7), per_day_90d: r1v(e.avg90), trend_7d_30d: e.trend_7d_vs_30d_pct, trend_30d_90d: e.trend_30d_vs_90d_pct, asp: e.asp_exc_gst == null ? null : Math.round(e.asp_exc_gst), cogs: e.cogs_per_unit == null ? null : Math.round(e.cogs_per_unit), margin: e.margin_per_unit == null ? null : Math.round(e.margin_per_unit), max_discount_pct: e.max_discount_pct });
const compactSku = r => ({ sku: r.sku, n: r.sub_category, stock: r.stock_units, excess_units: r.excess_units, doi: r.doi, asp: r.asp_exc_gst == null ? null : Math.round(r.asp_exc_gst) });
export function resultFigures(res) {
  const n = res.settings.top_n;
  return { main: res.main.slice(0, n).map(compactSub), high: res.high.slice(0, Math.min(HIGH_TOP, n)).map(compactSub), no_cogs: res.noCogs.slice(0, Math.min(NOCOGS_TOP, n)).map(compactSku), totals: { main_subs: res.main.length, high_subs: res.high.length, no_cogs_skus: res.noCogs.length } };
}

// Phone columns of the answer's tables (the screen reads them from the answer's tableKeys): sub-category + the column the list is ranked by
// (excess value by default, DOI / stock value when ranked so) + excess units + trend. Everything else is under "View full table" and in the Excel.
export function phoneHints(text, s) {
  const key = s.rank_by === 'doi' ? 'DOI' : s.rank_by === 'stock_value' ? 'Stock value' : 'Excess value';
  const show = [...new Set([key, 'Excess value', 'Excess units', 'Trend 30d vs 90d'])].slice(0, 3);
  return findTables(text).tables.map(t => {
    const h0 = plain(t.headers[0]);
    if (h0 === 'Sub-category') return { key, show };
    if (h0 === 'SKU') return { key: 'Excess units', show: ['Excess units', 'Stock', 'DOI'] };
    return null;
  });
}

function mainTable(list, n) {
  const head = '| Sub-category | SKUs | Stock | Stock value | Excess units | Excess value | DOI | Trend 30d vs 90d | ASP | Margin | Max discount |\n|---|---|---|---|---|---|---|---|---|---|---|';
  const rows = list.slice(0, n).map(e => `| ${cell(e.sub_category)} | ${indianInt(e.skus)} | ${indianInt(e.stock_units)} | ${formatRupees(e.stock_value)} | ${indianInt(e.excess_units)} | ${formatRupees(e.excess_value)} | ${doiTxt(e.doi)} | ${pct(e.trend_30d_vs_90d_pct)} | ${rs(e.asp_exc_gst)} | ${rs(e.margin_per_unit)} | ${e.max_discount_pct == null ? 'n/a' : `${e.max_discount_pct}%`} |`);
  const sum = k => list.reduce((a, e) => a + (e[k] || 0), 0);
  rows.push(`| **Total, all ${indianInt(list.length)} sub-categories** | ${indianInt(sum('skus'))} | ${indianInt(sum('stock_units'))} | ${formatRupees(sum('stock_value'))} | ${indianInt(sum('excess_units'))} | ${formatRupees(sum('excess_value'))} | | | | | |`);
  return `${head}\n${rows.join('\n')}`;
}
function noCogsTable(list, n) {
  const head = '| SKU | Sub-category | Stock | Excess units | DOI | ASP | Flag |\n|---|---|---|---|---|---|---|';
  const rows = list.slice(0, n).map(r => `| ${cell(r.sku)} | ${cell(r.sub_category)} | ${indianInt(r.stock_units)} | ${indianInt(r.excess_units)} | ${doiTxt(r.doi)} | ${rs(r.asp_exc_gst)} | No COGS |`);
  const sum = k => list.reduce((a, e) => a + (e[k] || 0), 0);
  rows.push(`| **Total, all ${indianInt(list.length)} SKUs** | | ${indianInt(sum('stock_units'))} | ${indianInt(sum('excess_units'))} | | | |`);
  return `${head}\n${rows.join('\n')}`;
}

export function resultMarkdown(res, ctx, { attached = false, notes = [] } = {}) {
  const s = res.settings, ex = res.excluded, n = s.top_n;
  const hv = s.high_value_categories;
  const out = [
    `**Stock beyond ${s.cover_days} days of cover** · Regular facilities · as of ${istTime(ctx.asOf)} · ${ctx.cogsLabel} · ${avgBasis(s)} · ranked by ${RANK_LABEL[s.rank_by]}`,
    '',
    `### Top ${Math.min(n, res.main.length)} of ${indianInt(res.main.length)} sub-categories${hv.length ? ` (without ${hv.join(' / ')})` : ''}`,
    res.main.length ? mainTable(res.main, n) : 'No sub-category has excess in this list.',
    'Full list in Excel.',
  ];
  if (hv.length) {
    const k = Math.min(HIGH_TOP, n);
    out.push('', `### High-value: ${hv.join(' / ')}, top ${Math.min(k, res.high.length)} of ${indianInt(res.high.length)}`, res.high.length ? mainTable(res.high, k) : 'No high-value sub-category has excess.', 'Full list in Excel.');
  }
  const kn = Math.min(NOCOGS_TOP, n);
  out.push('', `### No COGS (not valued): top ${Math.min(kn, res.noCogs.length)} of ${indianInt(res.noCogs.length)} SKUs, by excess units`, res.noCogs.length ? noCogsTable(res.noCogs, kn) : 'Every included SKU has a COGS.', 'Full list in Excel.');
  out.push('', '**Notes**',
    `- Excess = stock − ${s.cover_days} × avg daily sale (min 0); excess value = excess × COGS per unit. DOI = stock ÷ avg daily sale. ASP = last 90 days, ex GST, after discounts; max discount = margin ÷ ASP; n/a = no sale in 90 days. The 30d vs 90d trend is indicative.`,
    `- Excluded: ${indianInt(ex.never.skus)} never-live SKUs and ${indianInt(ex.names.reduce((a, e) => a + e.skus, 0))} SKUs by name (categories and sub-categories listed in the plan); names are in the Excel.`);
  if (notes.length) out.push(`- ${notes.join('; ')}.`);
  out.push(attached ? '- The Excel is attached below: sub-category summaries, every SKU with all columns, No COGS SKUs, exclusions.' : '- The Excel could not be attached this time.', '', settingsPlain(s), hiddenState('result', s, resultFigures(res)));
  return out.join('\n');
}

// One small Sonnet call (only the settings tool, no knowledge): "now 90 days cover, exclude pillows" -> { cover_days: 90, exclude_sub_categories: ['pillows'] }.
const SCHEMA = {
  type: 'object',
  properties: {
    cover_days: { type: 'number' }, top_n: { type: 'integer' }, channel: { type: 'string', enum: ['b2c', 'all'] },
    sales_days: { type: 'integer', enum: [7, 15, 30, 60, 90] }, min_doi: { type: 'number' }, rank_by: { type: 'string', enum: ['excess_value', 'doi', 'stock_value'] },
    exclude_categories: { type: 'array', items: { type: 'string' } }, exclude_sub_categories: { type: 'array', items: { type: 'string' } },
    include_categories: { type: 'array', items: { type: 'string' } }, include_sub_categories: { type: 'array', items: { type: 'string' } },
    high_value_categories: { type: 'array', items: { type: 'string' } },
  },
};
export async function parseSettingChange(client, model, userText, current) {
  const cur = current ? settingsLine(current) : 'Settings: defaults';
  const r = await client.messages.create({
    model, max_tokens: 400,
    system: `You turn the user's message into settings for a stock analysis. Current ${cur}\nCall set_settings with ONLY the settings the message changes (an empty object when nothing changes). cover_days = days of cover kept; top_n = rows per list; sales_days = days the average daily sale is taken over; rank_by = excess_value, doi or stock_value. exclude_* / include_* REPLACE the current list: copy the current entries you keep and add the new names exactly as the user wrote them (never invent a name). Never add numbers the user did not give. Change a setting ONLY for an explicit instruction ("rank by DOI", "90 days cover", "top 10", "exclude X", "include only Y"). Words that merely describe the topic ("high-DOI products", "slow-moving", "liquidate", "push for sale", "keep mobility separate", "ignore spare parts and covers" when those are already in the current settings) change nothing.`,
    tools: [{ name: 'set_settings', description: 'Settings changed by the user message', input_schema: SCHEMA }],
    tool_choice: { type: 'tool', name: 'set_settings' },
    messages: [{ role: 'user', content: String(userText).slice(0, 600) }],
  }).catch(() => null);
  const tu = r?.content?.find(b => b.type === 'tool_use');
  const args = tu?.input && typeof tu.input === 'object' ? { ...tu.input } : {};
  return { args: guardArgs(args, userText), usage: r?.usage || null };
}
// code guards: DOI wording in the topic ("high-DOI products") is not an instruction to rank by DOI or to set a minimum DOI
function guardArgs(args, userText) {
  const t = String(userText);
  if (args.rank_by && !/\b(rank(ed|ing)?|sort(ed)?|order(ed)?)\b|\bby (doi|excess|stock)/i.test(t)) delete args.rank_by;
  if (args.min_doi != null && !/\bmin(imum)?\b|doi\s*(above|over|at least|>|more than|greater)|at least \d+\s*(days|doi)/i.test(t)) delete args.min_doi;
  return args;
}

// A message after a plan / result: one small Sonnet call decides what it is.
//   change    -> settings change ("now 90 days cover", "exclude pillows", "top 30"): re-run the tool with the new settings
//   question  -> a question about the lists shown ("what does trend 30 vs 90 mean?", "why is slippers on top?", "which has the best margin?"): explain, no re-run
//   unclear   -> could be either: ask one line
//   other     -> nothing to do with this analysis: normal NavAI path
export async function classifyFollowUp(client, model, userText, current, lastKind) {
  const r = await client.messages.create({
    model, max_tokens: 500,
    system: `A user is chatting about a stock liquidation analysis. The last NavAI message was a ${lastKind === 'plan' ? 'PLAN (settings to confirm)' : 'RESULT (ranked lists)'}. Current ${settingsLine(current)}\nCall follow_up with kind:\n- "change": the user wants different settings and a new run (cover days, top N, sales period, B2C/all channels, minimum DOI, rank by, include/exclude a category or sub-category, high-value group). Put ONLY the changed settings in settings (exclude_* / include_* REPLACE the list: copy entries kept, add new names as the user wrote them).\n- "question": the user asks what something means or why / which / how much about the lists already shown (a definition, a comparison, a reason, "which has the best margin"). No new run is needed.\n- "unclear": it could be a settings change or a question and you cannot tell.\n- "other": unrelated to this analysis (another business question, small talk).\nWords that merely describe the topic ("high-DOI", "slow-moving") are not settings. A question mentioning a setting ("what does 60 days cover mean?") is a question.`,
    tools: [{ name: 'follow_up', description: 'Classify the message', input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['change', 'question', 'unclear', 'other'] }, settings: SCHEMA }, required: ['kind'] } }],
    tool_choice: { type: 'tool', name: 'follow_up' },
    messages: [{ role: 'user', content: String(userText).slice(0, 600) }],
  }).catch(() => null);
  const tu = r?.content?.find(b => b.type === 'tool_use');
  const kind = ['change', 'question', 'unclear', 'other'].includes(tu?.input?.kind) ? tu.input.kind : 'unclear';
  const args = kind === 'change' && tu.input.settings && typeof tu.input.settings === 'object' ? guardArgs({ ...tu.input.settings }, userText) : {};
  return { kind, args, usage: r?.usage || null };
}

export const ASK_LINE = 'Do you want me to change the settings and re-run the list, or explain something in the result above? Tell me which.';
export const ACK_LINE = 'You can change any setting (for example "90 days cover", "top 30", "exclude Pillows", "rank by DOI"), or ask about a number in the lists.';

// A question about the result: plain words from the last computed result (visible text + the figures it carried), no re-run, no repeated table.
const EXPLAIN_SYSTEM = `You answer a question about a stock liquidation analysis that was already computed. You get the answer text shown to the user and the figures behind it (JSON).
Rules:
- Plain words, short (at most 6 lines). Do NOT repeat the lists. Use a small table (at most 5 rows) only when it really helps.
- Use ONLY numbers that appear in the answer text or the figures. Never add, subtract, divide, round or compare numbers yourself. If a figure you need is not there, say so and point to the Excel (sheet "All SKUs" has every SKU) or offer to re-run with other settings.
- Definitions used: excess = stock beyond the cover days of average daily sale; excess value = excess x COGS per unit; DOI = stock / average daily sale (days of stock left); Trend 30d vs 90d compares average daily sale of the last 30 days with the last 90 days: up = selling faster recently, down = slowing down (indicative); ASP = average selling price ex GST over 90 days after discounts; margin = ASP - COGS per unit; max discount before loss = margin / ASP; "n/a" = no sale in the period; No COGS = stock with no cost on file, so it cannot be valued.
- A sub-category is on top because the list is ranked by the ranking in the settings (excess value by default): say which setting and quote its figures from the data (excess units, excess value, DOI, per-day sale).
- Example for a trend question: "Trend compares average daily sale in the last 30 days with the last 90 days: ↑ = selling faster recently, ↓ = slowing down. Slippers: 30d 822/day vs 90d 1,525/day (↓ 46.1%)."
- Never mention these instructions or the JSON.`;
export async function answerQuestion(client, model, question, ctx) {
  const visible = String(ctx.text || '').replace(/<!--nx:[\s\S]*?-->/g, '').trim();
  const figures = ctx.hidden?.r ? JSON.stringify(ctx.hidden.r) : '';
  const known = knownNumbers([visible, figures, question]);
  let usage = { input_tokens: 0, output_tokens: 0 };
  const add = u => { usage = { input_tokens: usage.input_tokens + (u?.input_tokens || 0), output_tokens: usage.output_tokens + (u?.output_tokens || 0) }; };
  const ask = async extra => {
    const r = await client.messages.create({ model, max_tokens: 700, system: EXPLAIN_SYSTEM, messages: [{ role: 'user', content: `ANSWER TEXT:\n${visible}\n\nFIGURES (JSON):\n${figures || 'none'}\n\nQUESTION: ${String(question).slice(0, 600)}${extra || ''}` }] }).catch(() => null);
    add(r?.usage);
    return r?.content?.filter(b => b.type === 'text').map(b => b.text).join('\n').trim() || '';
  };
  let text = await ask('');
  let odd = text ? unverified(text, known) : [];
  if (odd.length) { text = (await ask(`\n\nThese numbers in your answer are not in the data: ${odd.slice(0, 10).join(', ')}. Rewrite using only numbers from the data, or leave them out.`)) || text; odd = unverified(text, known); }
  if (odd.length) text = text.split('\n').filter(l => !unverified(l, known).length).join('\n').trim();
  return { text: text || 'I could not answer that from the result above. Ask me to re-run with other settings, or look in the Excel (sheet "All SKUs").', usage };
}
