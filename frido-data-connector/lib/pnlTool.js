// `pnl` tool: P&L per channel and period, as the P&L page computes it.
// TEMPORARY COPY of the P&L page logic (it runs the page's own code headlessly, see lib/pnlHeadless.js) —
// docs/BACKLOG.md: "temporary copy of PnLPage logic, replace with shared module".
import { runPnl } from './pnlHeadless.js';
import { runSupabase } from './supabase.js';
import { formatRupees, indianInt } from './format.js';
import { istDates } from './dates.js';

// Channel name -> P&L tab id. Overall P&L is deliberately not available.
const TABS = {
  d2c: 'shopify', shopify: 'shopify', amazon: 'amazon', flipkart: 'flipkart', ebo: 'ebo', retail: 'ebo',
  offline: 'offline', 'offline sales': 'offline', blinkit: 'blinkit', zepto: 'zepto', instamart: 'instamart',
  cred: 'cred', firstcry: 'firstcry', myntra: 'myntra',
};
const LABEL = { shopify: 'D2C', amazon: 'Amazon', flipkart: 'Flipkart', ebo: 'EBO', offline: 'Offline Sales', blinkit: 'Blinkit', zepto: 'Zepto', instamart: 'Instamart', cred: 'CRED', firstcry: 'Firstcry', myntra: 'Myntra' };

// Channels whose numbers have been checked against the P&L screen (within 0.5%). Set PNL_VERIFIED=shopify,amazon in the
// service env after checking; anything else is labelled approximate.
const verified = () => new Set((process.env.PNL_VERIFIED || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = iso => { const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z'); return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

function resolvePeriod(args) {
  if (args.start && args.end) return { start: args.start, end: args.end };
  const m = /^(\d{4})-(\d{2})$/.exec(String(args.month || ''));
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]);
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const today = istDates().today;
    const end = `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`;
    return { start: `${m[1]}-${m[2]}-01`, end: end > today ? today : end };
  }
  const d = istDates();
  return { start: d.last_month_start, end: d.last_month_end };
}

async function cogsMonths(start, end) {
  try {
    const a = start.slice(0, 7) + '-01', b = end.slice(0, 7) + '-01';
    const r = await runSupabase(`SELECT month, cogs_source, MIN(carried_from_month) AS carried_from FROM product_cogs_monthly WHERE month BETWEEN '${a}' AND '${b}' GROUP BY 1, 2 ORDER BY 1`);
    const lines = r.split('\n').slice(1).filter(Boolean).map(l => l.split('\t'));
    return lines.map(([month, src, from]) => {
      const m = new Date(month);
      const ym = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
      if (src === 'carried_forward' && from && from !== 'NULL') {
        const f = new Date(from);
        return `${monthLabel(ym)} uses ${monthLabel(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-01`)} per-SKU cost (carried forward)`;
      }
      return `${monthLabel(ym)} uses its own per-SKU cost (actual)`;
    });
  } catch {
    return [];
  }
}

const money = n => (n == null || Number.isNaN(n) ? 'n/a' : `${formatRupees(n)} (raw ${Math.round(n)})`);
const pct = n => (n == null || Number.isNaN(n) ? 'n/a' : `${n.toFixed(1)}%`);

export async function runPnlTool(args = {}, seen) {
  const key = String(args.channel || '').trim().toLowerCase();
  if (!key || key === 'all' || key === 'overall') return { text: 'Overall P&L is not available yet. Ask for one channel (D2C, Amazon, Flipkart, EBO, Offline, Blinkit, Zepto, Instamart, CRED, Firstcry, Myntra).' };
  const tab = TABS[key];
  if (!tab) return { text: `Unknown P&L channel "${args.channel}". Available: ${Object.keys(LABEL).map(t => LABEL[t]).join(', ')}.` };
  const { start, end } = resolvePeriod(args);
  const s = await runPnl({ tab, start, end });
  const k = s.kpi || {};
  const exact = verified().has(tab) || verified().has(key);
  const cogsLines = await cogsMonths(start, end);
  const rows = [
    ['gross_revenue_inc_gst', s.gross], ['net_revenue', s.net], ['cogs', s.cogs], ['gross_margin', s.gm], ['snd', s.snd],
    ['cm1', s.cm1], ['marketing_spend', s.spend], ['cm2', s.cm2],
  ];
  const lines = [
    `P&L → ${LABEL[tab]} · ${start} to ${end} (IST) · as the P&L page computes it`,
    `ACCURACY: ${exact ? 'matches the P&L page' : 'UNVERIFIED. Start your answer with exactly "Unverified, please cross-check the P&L page:" and then give the numbers.'}`,
    `COGS month used: ${cogsLines.length ? cogsLines.join('; ') : 'not available'}`,
    'metric\tvalue',
    ...rows.map(([m, v]) => { if (seen && v != null) seen.add(formatRupees(v)); return `${m}\t${money(v)}`; }),
    `cogs_pct_of_net\t${pct(k.cogsPct)}`, `gross_margin_pct\t${pct(k.gmPct)}`, `snd_pct\t${pct(k.sndPct)}`, `cm1_pct\t${pct(k.cm1Pct)}`,
    `marketing_pct_of_net\t${pct(k.spendPct)}`, `cm2_pct\t${pct(k.cm2Pct)}`, `roas\t${k.roas == null ? 'n/a' : k.roas.toFixed(2)}`,
    `orders\t${s.orders == null ? 'n/a' : indianInt(s.orders)}`, `units\t${s.units == null ? 'n/a' : indianInt(s.units)}`,
  ];
  if (args.breakdown) {
    const m = Object.entries(s.margins || {}).map(([sc, v]) => ({ sc, cat: v.cat, excRev: v.excRev, cm1: v.cm1 })).sort((a, b) => b.cm1 - a.cm1);
    const fmt = r => `${r.sc}\t${r.cat}\t${money(r.excRev)}\t${money(r.cm1)}\t${r.excRev ? pct((r.cm1 / r.excRev) * 100) : 'n/a'}`;
    lines.push('', 'product margins (sub-category, category, gross ex GST, CM1, CM1 % of gross ex GST) — top 10 and bottom 10 by CM1', 'sub_category\tcategory\tgross_revenue_ex_gst\tcm1\tcm1_pct_of_gross');
    lines.push(...m.slice(0, 10).map(fmt));
    if (m.length > 20) lines.push('…', ...m.slice(-10).map(fmt));
  }
  return { text: lines.join('\n') };
}
