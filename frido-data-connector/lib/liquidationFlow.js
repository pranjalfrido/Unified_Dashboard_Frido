// The liquidation / push-for-sale analysis runs without a writing model: the plan and the result are built here from the tool's own
// numbers, so every figure is exact and an answer costs almost nothing. A model (Sonnet) is used only for one tiny call that turns a
// free-text settings change ("now 90 days cover, exclude pillows") into settings.
//   detectFlow(messages)            -> { mode: 'plan' | 'run', parse: boolean } or null (not a liquidation question: normal path)
//   preflightDenial(user, text, f)  -> refusal text (no model call) when the person lacks the permission the question needs, else null
//   planMarkdown / resultMarkdown   -> the answer texts
//   parseSettingChange(client, ...) -> { args, usage }
import { indianInt, formatRupees } from './format.js';
import { settingsLine, settingsFromChat } from './inventoryOpportunity.js';
import { checkInventoryCost, checkOos, checkCn } from './pageAccess.js';

export const HIGH_TOP = 5, NOCOGS_TOP = 5;
const TOPIC = /liquidat|push (it |them )?for sale|slow.?moving|high.?doi|dead stock|excess stock|clear(ing)? (the )?(excess |slow |old )?stock/i;
const RUN_NOW = /\b(run it now|no questions|don'?t ask|do not ask|without (asking|questions)|skip (the )?questions|just run|go ahead and run|with (the )?defaults)\b/i;
const CONFIRM = /^\s*(yes|yeah|yep|yup|y|ok|okay|sure|go ahead|go|run it|run|proceed|confirmed?|do it|haan|ha|looks good|go for it|please run it)\b(?:[\s,.!]*(?:please|run it|with (?:these|the same|those) settings|go ahead|now))*[\s.!]*$/i;
const CHANGE = /cover|top\s*\d+|\b\d+\s*(skus?|sub.?categor)|rank|sort|\bdoi\b|excess value|stock value|sales (period|days|average)|\b(7|15|30|60|90)\s*-?\s*(day|days|d)\b|channel|b2c|all channels|exclude|include|only|ignore|without|high.?value|instead|change|set |now |also |remove|add /i;
const PLAN_ASKED = /Shall I run it with these settings\?/;

const lastOf = (messages, role) => [...messages].reverse().find(m => m.role === role);
const textOf = m => String(m?.content ?? m?.text ?? '');

export function detectFlow(messages) {
  const msgs = Array.isArray(messages) ? messages : [];
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== 'user' || (Array.isArray(last.attachments) && last.attachments.length)) return null;
  const q = textOf(last);
  const prevAssistant = lastOf(msgs.slice(0, -1), 'assistant');
  const prevText = textOf(prevAssistant);
  if (prevAssistant && /^\s*(?:\*\*)?Settings:/m.test(prevText)) {
    if (CONFIRM.test(q) && q.length < 80) return { mode: 'run', parse: false };
    if (PLAN_ASKED.test(prevText) || settingsFromChat(msgs.slice(0, -1))) {
      if (CHANGE.test(q) && q.length < 400) return { mode: 'run', parse: true };
    }
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
    settingsLine(s),
  ];
  return lines.join('\n');
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
  out.push(attached ? '- The Excel is attached below: sub-category summaries, every SKU with all columns, No COGS SKUs, exclusions.' : '- The Excel could not be attached this time.', '', settingsLine(s));
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
    system: `You turn the user's message into settings for a stock analysis. Current ${cur}\nCall set_settings with ONLY the settings the message changes (an empty object when nothing changes). cover_days = days of cover kept; top_n = rows per list; sales_days = days the average daily sale is taken over; rank_by = excess_value, doi or stock_value. exclude_* / include_* REPLACE the current list: copy the current entries you keep and add the new names exactly as the user wrote them (never invent a name). Never add numbers the user did not give.`,
    tools: [{ name: 'set_settings', description: 'Settings changed by the user message', input_schema: SCHEMA }],
    tool_choice: { type: 'tool', name: 'set_settings' },
    messages: [{ role: 'user', content: String(userText).slice(0, 600) }],
  }).catch(() => null);
  const tu = r?.content?.find(b => b.type === 'tool_use');
  const args = tu?.input && typeof tu.input === 'object' ? tu.input : {};
  return { args, usage: r?.usage || null };
}
