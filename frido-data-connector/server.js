import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import http from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { runBigQuery } from './lib/bigquery.js';
import { runSupabase, queryRows } from './lib/supabase.js';
import { runRepo } from './lib/repo.js';
import { isAllowed, blockReason } from './lib/safety.js';
import { log } from './lib/logger.js';
import { validateRequest } from './lib/auth.js';
import { authorizeToolCall } from './lib/authz.js';
import { buildContent, checkAttachments, describeAttachments, FILE_SAFETY_PROMPT } from './lib/attachments.js';
import { normaliseAccess, checkEndpoint, checkPnl, checkOos, checkCn, checkRawSql, checkInventoryCost } from './lib/pageAccess.js';
import { writeAuditLog } from './lib/audit.js';
import { checkBudget, trackUsage, sendLimitEmail, getStats } from './lib/costTracker.js';
import { formatTsv, unformattedNumbers } from './lib/format.js';
import { runOosPage } from './lib/oosPage.js';
import { runPnlTool, TABS as PNL_TAB } from './lib/pnlTool.js';
import { runCnTool } from './lib/cnTool.js';
import { runDashboardApi, ENDPOINTS as DASH_ENDPOINTS } from './lib/dashboardApi.js';
import { isBillingError, alertBilling, UNAVAILABLE_MESSAGE } from './lib/billingAlert.js';
import { normalizeSql, datesBlock } from './lib/dates.js';
import { enrichSkus, wrongNames } from './lib/skuMaster.js';
import { freshnessNote } from './lib/freshness.js';
import { loadCatalog, matchProducts, describeMatch, findProductText } from './lib/productMatch.js';
import { detectMetric, computeProductMetric, liveDeps } from './lib/productMetric.js';
import { knownNumbers, unverified, replaceTables, tsvToMarkdown } from './lib/numberCheck.js';
import { fillTotals, keyColumns } from './lib/tableHints.js';
import { chooseModel, OPUS, SONNET } from './lib/modelChoice.js';
import { detectFlow, preflightDenial, planMarkdown, resultMarkdown, parseSettingChange, classifyFollowUp, answerQuestion, phoneHints, isLiquidationTopic, ASK_LINE, ACK_LINE } from './lib/liquidationFlow.js';
import { buildKnowledge, sectionsForTopics, TOPICS } from './lib/knowledgeSections.js';
import { fetchEndpoint } from './lib/dashboardApi.js';
import { runInventoryCost } from './lib/inventoryCost.js';
import { getBQ, guardSql } from './lib/bigquery.js';
import { runInventoryOpportunity, defaultSettings, mergeSettings, flowMessageFromChat, settingsFromChat, planText, resultText, buildWorkbook, SALES_SQL } from './lib/inventoryOpportunity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readKnowledge = name => {
  try { return readFileSync(path.join(__dirname, 'knowledge', name), 'utf8'); } catch { return ''; }
};
// KNOWLEDGE_FILE (tests only) points at a candidate CLAUDE.md instead of knowledge/CLAUDE.md.
const CORE = process.env.KNOWLEDGE_FILE ? readFileSync(process.env.KNOWLEDGE_FILE, 'utf8') : readKnowledge('CLAUDE.md');
const KNOWLEDGE = [CORE, readKnowledge('PULSE_PLAYBOOK.md'), readKnowledge('PULSE_METRICS.md'), readKnowledge('ENDPOINT_MAP.md')].filter(Boolean).join('\n\n---\n\n');

const TOOL_DESCRIPTION = `Run a read-only command against Frido live data. Use for ANY Frido business question — stock, revenue, returns, logistics, courier, ads, or any metric.
- target=bigquery → SQL query against BigQuery tables
- target=supabase → SQL query against Supabase tables
- target=repo → cat/ls/head/grep to read dashboard formula code from GitHub`;

// /chat sends the knowledge in two cached blocks: the part every question needs, then the sections for the question's topics
// (lib/knowledgeSections.js). The dates block changes every minute, so it goes last and is not cached.
const KNOWLEDGE_FILES = { claude: CORE, map: readKnowledge('ENDPOINT_MAP.md'), playbook: readKnowledge('PULSE_PLAYBOOK.md'), metrics: readKnowledge('PULSE_METRICS.md') };
function buildSystemBlocks(userTexts) {
  const kb = buildKnowledge(KNOWLEDGE_FILES, userTexts);
  const head = `The assistant's name is NavAI. Refer to yourself only as NavAI, never as Pulse or Frido Pulse.

You have access to the run_command tool which connects to Frido's live business data. NEVER answer business questions from memory — always use run_command to query live data first.

${kb.always}

${FILE_SAFETY_PROMPT}`;
  const blocks = [{ type: 'text', text: head, cache_control: { type: 'ephemeral' } }];
  if (kb.selected) blocks.push({ type: 'text', text: kb.selected, cache_control: { type: 'ephemeral' } });
  blocks.push({ type: 'text', text: datesBlock() });
  return { blocks, kb };
}
// The last message carries a cache mark too, so each step of the tool loop reads the earlier steps from the cache.
function withCache(msgs) {
  if (!msgs.length) return msgs;
  const last = msgs[msgs.length - 1];
  const content = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : [...last.content];
  if (!content.length) return msgs;
  content[content.length - 1] = { ...content[content.length - 1], cache_control: { type: 'ephemeral' } };
  return [...msgs.slice(0, -1), { ...last, content }];
}

function buildSystemPrompt() {
  return `${datesBlock()}

The assistant's name is NavAI. Refer to yourself only as NavAI, never as Pulse or Frido Pulse.

You have access to the run_command tool which connects to Frido's live business data. NEVER answer business questions from memory — always use run_command to query live data first.

${KNOWLEDGE}

${FILE_SAFETY_PROMPT}`;
}

// Single tool executor — used by both MCP and /chat.
// Returns { ok, text, denied?, skus?, note?, sql? }. `denied` = refused by the authorization or safety
// layer (not a query error); /chat counts these and tells the model not to retry.
async function executeTool(user, command, target, seen) {
  const start = Date.now();
  // A tool call with no command (seen 26 Nov 2026: crashed /chat with a 500 "Chat failed") goes back to the model as a normal error.
  if (typeof command !== 'string' || !command.trim()) return { ok: false, error: 'The tool call had no command. Send run_command with a command and a target.' };
  const sqlOk = checkRawSql(user);
  if (!sqlOk.ok) return sqlOk;
  // Force IST in any SQL the model wrote (CURRENT_DATE() -> CURRENT_DATE('Asia/Kolkata')).
  if (target === 'bigquery' || target === 'supabase') command = normalizeSql(command, target);

  const authzResult = authorizeToolCall(user, 'run_command', target);
  if (!authzResult.ok) {
    writeAuditLog({ user, tool: 'run_command', target, command, outcome: 'denied', denialReason: authzResult.message, latencyMs: Date.now() - start });
    log({ user: user.email, role: user.role, target, command, allowed: false, reason: authzResult.message, duration: Date.now() - start });
    return { ok: false, denied: true, text: authzResult.message };
  }

  if (!isAllowed(command, target)) {
    const reason = blockReason(command, target);
    writeAuditLog({ user, tool: 'run_command', target, command, outcome: 'denied', denialReason: reason, latencyMs: Date.now() - start });
    log({ user: user.email, role: user.role, target, command, allowed: false, reason, duration: Date.now() - start });
    return { ok: false, denied: true, text: `Not permitted: ${reason}` };
  }

  try {
    let result;
    if (target === 'bigquery') result = await runBigQuery(command);
    else if (target === 'supabase') result = await runSupabase(command);
    else result = await runRepo(command);

    let text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    let skus = new Map();
    let note = null;
    if (target === 'bigquery' || target === 'supabase') {
      // SKU rows get Sub-category + Category from the SKU master; amounts and counts are formatted
      // in the Indian system here so the model copies them instead of converting units itself.
      ({ text, skus } = await enrichSkus(text));
      text = formatTsv(text, seen);
      if (target === 'bigquery') note = await freshnessNote(command);
    }
    const truncated = text.length > 50000;
    const output = truncated ? text.slice(0, 50000) + '\n\n[truncated: true]' : text;
    const latencyMs = Date.now() - start;

    writeAuditLog({ user, tool: 'run_command', target, command, outcome: 'ok', rowsReturned: text.split('\n').length, latencyMs });
    log({ user: user.email, role: user.role, target, command, allowed: true, resultSize: text.length, truncated, duration: latencyMs });
    return { ok: true, text: output, skus, note, sql: command };
  } catch (err) {
    const reqId = Math.random().toString(36).slice(2, 10);
    const latencyMs = Date.now() - start;
    writeAuditLog({ user, tool: 'run_command', target, command, outcome: 'error', denialReason: err.message, latencyMs, reqId });
    log({ user: user.email, role: user.role, target, command, allowed: true, error: err.message, reqId, duration: latencyMs });
    // The model sees the real error so it can fix the query; users never do.
    return { ok: false, text: `Query failed (ref: ${reqId}): ${String(err.message).slice(0, 300)}`, error: String(err.message).slice(0, 160) };
  }
}

// OOS loss as the Inventory Health "OOS loss" page computes it (its own SQL + maths, see lib/oosPage.js).
async function executeOos(user, args, seen) {
  const start = Date.now();
  const authz = authorizeToolCall(user, 'run_command', 'bigquery');
  if (!authz.ok) return { ok: false, denied: true, text: authz.message };
  const page = checkOos(user);
  if (!page.ok) return page;
  try {
    const { text } = await runOosPage({ limit: args?.limit, sku: args?.sku });
    const [head, ...rest] = text.split('\n');
    let body = rest.join('\n');
    let skus = new Map();
    if (body) {
      ({ text: body, skus } = await enrichSkus(body));
      body = formatTsv(body, seen);
    }
    const out = body ? `${head}\n${body}` : head;
    log({ user: user.email, role: user.role, target: 'oos_loss', command: JSON.stringify(args || {}), allowed: true, resultSize: out.length, duration: Date.now() - start });
    return { ok: true, text: out, skus, sql: 'oos_loss (Inventory Health > OOS loss page logic)' };
  } catch (err) {
    log({ user: user.email, role: user.role, target: 'oos_loss', allowed: true, error: err.message, duration: Date.now() - start });
    return { ok: false, text: `OOS page query failed: ${String(err.message).slice(0, 300)}`, error: String(err.message).slice(0, 160) };
  }
}

// Logistics -> Cost Analytics -> CN Received: totals of credit notes received vs invoice value (lib/cnTool.js). Read-only.
// find_product: the same shared matching step the connector runs on every question.
async function executeFindProduct(args) {
  const q = typeof args?.query === 'string' ? args.query.trim() : '';
  if (!q) return { ok: false, error: 'find_product needs a query: the product words or SKU code.' };
  try { return { ok: true, text: await findProductText(q) }; }
  catch (e) { return { ok: false, error: `Product matching is unavailable right now (${String(e.message).slice(0, 120)}).` }; }
}

// The product words in the latest question (or, for a follow-up like "and last month?", in the nearest earlier one) are matched
// in code, so the model never chooses a product set on its own. Returns '' when there is no product word or matching failed.
// Also calculates, in code, the numbers for "<product> inward/sales <period>" (lib/productMetric.js) when the user may see that page.
// Returns { block, computed } ('' / null when there is nothing to add).
async function productMatchBlock(messages, user) {
  try {
    const catalog = await loadCatalog();
    const users = messages.filter(m => m.role === 'user');
    for (const [idx, m] of users.slice(-3).reverse().entries()) {
      const text = String(m.content ?? m.text ?? '');
      // An earlier long message or a liquidation request is not a product the person is still asking about (its words like "products",
      // "furniture", "covers" matched hundreds of SKUs and made a later unrelated question cost 5x).
      if (idx > 0 && (text.length > 300 || isLiquidationTopic(text))) continue;
      const result = matchProducts(catalog, text);
      let block = describeMatch(result);
      if (!block) continue;
      let computed = null;
      const metric = detectMetric(text);
      const allowed = metric === 'inward' ? checkEndpoint(user, 'inward').ok : metric === 'sales' ? checkEndpoint(user, 'bq').ok : false;
      if (allowed) computed = await computeProductMetric(text, result, liveDeps({ fetchEndpoint, getBQ }));
      if (computed) {
        block += `\n\n[Computed result, FINAL numbers calculated by the connector from the page's own data. Copy these numbers exactly. Never add, subtract, divide, round or compare numbers yourself: every total, percentage and comparison you may use is in this result. Your answer = this headline, this table, and at most two short sentences of wording. You do not need any tool for these numbers.]\n${computed.text}`;
      }
      return { block, computed };
    }
  } catch (e) { console.error('Product match skipped:', e.message); }
  return { block: '', computed: null };
}

// inventory_opportunity: stock beyond N days of cover per sub-category (permission inventory:cost), read-only. The Excel goes back in outFiles.
async function executeInventoryOpportunity(user, args, chatSettings, outFiles, asMarkdown = false) {
  const start = Date.now();
  const authz = authorizeToolCall(user, 'run_command', 'bigquery');
  if (!authz.ok) return { ok: false, denied: true, text: authz.message };
  const page = checkInventoryCost(user);
  if (!page.ok) return page;
  try {
    const deps = {
      invFile: async n => (await fetchEndpoint(n, {})).data,
      cogsMonthly: async b => (await fetchEndpoint('cogs-monthly', b)).data,
      sales: async () => { guardSql(SALES_SQL); const [rows] = await getBQ().query({ query: SALES_SQL, useLegacySql: false, maximumBytesBilled: '10000000000' }); return rows; },
      firstSales: async () => queryRows('SELECT product_code, sku_first_sales_date FROM item_master'),
    };
    const { res, ctx, notes } = await runInventoryOpportunity(args || {}, deps, chatSettings, OPP_DEFAULTS);
    let text, attached = false;
    if (args?.mode === 'plan') text = asMarkdown ? planMarkdown(res, ctx, notes) : planText(res, ctx);
    else {
      try { const file = await buildWorkbook(res, ctx); if (file) { outFiles.push(file); attached = true; } } catch (e) { log({ user: user.email, role: user.role, target: 'inventory_opportunity', allowed: true, excel_error: String(e.message).slice(0, 120) }); }
      text = asMarkdown ? resultMarkdown(res, ctx, { attached, notes }) : resultText(res, { ...ctx, attached });
    }
    if (notes.length && !asMarkdown) text += `\nNote: ${notes.join('; ')} (those values were ignored and the earlier setting was kept).`;
    log({ user: user.email, role: user.role, target: 'inventory_opportunity', command: JSON.stringify({ mode: args?.mode || 'run', cover: res.settings.cover_days, days: res.settings.sales_days }).slice(0, 200), allowed: true, resultSize: text.length, excel: attached, duration: Date.now() - start });
    return { ok: true, text, skus: new Map(), sql: 'inventory_opportunity (Inventory cost card valuation + stock beyond cover)' };
  } catch (err) {
    log({ user: user.email, role: user.role, target: 'inventory_opportunity', allowed: true, error: err.message, duration: Date.now() - start });
    return { ok: false, text: `Inventory opportunity analysis failed: ${String(err.message).slice(0, 300)}`, error: String(err.message).slice(0, 160) };
  }
}

// inventory_cost: the Inventory Health "Inventory cost detail" card (permission inventory:cost), same valuation rule as the card.
async function executeInventoryCost(user, args) {
  const start = Date.now();
  const authz = authorizeToolCall(user, 'run_command', 'bigquery');
  if (!authz.ok) return { ok: false, denied: true, text: authz.message };
  const page = checkInventoryCost(user);
  if (!page.ok) return page;
  try {
    const { text } = await runInventoryCost(args || {}, { invFile: async n => (await fetchEndpoint(n, {})).data, cogsMonthly: async b => (await fetchEndpoint('cogs-monthly', b)).data });
    log({ user: user.email, role: user.role, target: 'inventory_cost', command: JSON.stringify({ by: args?.by, status: args?.status }).slice(0, 200), allowed: true, resultSize: text.length, duration: Date.now() - start });
    return { ok: true, text, skus: new Map(), sql: 'inventory_cost (Inventory Health > Inventory cost detail card logic)' };
  } catch (err) {
    log({ user: user.email, role: user.role, target: 'inventory_cost', allowed: true, error: err.message, duration: Date.now() - start });
    return { ok: false, text: `Inventory cost query failed: ${String(err.message).slice(0, 300)}`, error: String(err.message).slice(0, 160) };
  }
}

async function executeCn(user, args, seen) {
  const start = Date.now();
  const authz = authorizeToolCall(user, 'run_command', 'bigquery');
  if (!authz.ok) return { ok: false, denied: true, text: authz.message };
  const page = checkCn(user);
  if (!page.ok) return page;
  try {
    const { text } = await runCnTool(args, seen);
    log({ user: user.email, role: user.role, target: 'cn_received', command: JSON.stringify(args || {}), allowed: true, resultSize: text.length, duration: Date.now() - start });
    return { ok: true, text, skus: new Map(), sql: 'cn_received (Logistics > Cost Analytics > CN Received page logic)' };
  } catch (err) {
    log({ user: user.email, role: user.role, target: 'cn_received', allowed: true, error: err.message, duration: Date.now() - start });
    return { ok: false, text: `CN Received query failed: ${String(err.message).slice(0, 300)}`, error: String(err.message).slice(0, 160) };
  }
}

// P&L per channel and month, as the P&L page computes it (TEMPORARY COPY of the page logic, see lib/pnlTool.js).
async function executePnl(user, args, seen) {
  const start = Date.now();
  const authz = authorizeToolCall(user, 'run_command', 'bigquery');
  if (!authz.ok) return { ok: false, denied: true, text: authz.message };
  const page = checkPnl(user, PNL_TAB[String(args?.channel || '').trim().toLowerCase()] || 'all');
  if (!page.ok) return page;
  try {
    const { text } = await runPnlTool(args, seen);
    log({ user: user.email, role: user.role, target: 'pnl', command: JSON.stringify(args || {}), allowed: true, resultSize: text.length, duration: Date.now() - start });
    return { ok: true, text, skus: new Map(), sql: 'pnl (P&L page logic)' };
  } catch (err) {
    log({ user: user.email, role: user.role, target: 'pnl', allowed: true, error: err.message, duration: Date.now() - start });
    return { ok: false, text: `P&L page calculation failed: ${String(err.message).slice(0, 300)}`, error: String(err.message).slice(0, 160) };
  }
}

// Generic read-only access to the dashboard's own /api/* endpoints (see knowledge/ENDPOINT_MAP.md for what is where).
async function executeDashboardApi(user, args, seen) {
  const start = Date.now();
  const authz = authorizeToolCall(user, 'run_command', 'bigquery');
  if (!authz.ok) return { ok: false, denied: true, text: authz.message };
  const page = checkEndpoint(user, String(args?.endpoint || '').replace(/^\/?api\//, '').replace(/\.json$/, ''), args);
  if (!page.ok) return page;
  try {
    const { text } = await runDashboardApi(args, seen);
    log({ user: user.email, role: user.role, target: 'dashboard_api', command: JSON.stringify({ endpoint: args?.endpoint, params: args?.params, paths: args?.paths }).slice(0, 500), allowed: true, resultSize: text.length, duration: Date.now() - start });
    return { ok: true, text, skus: new Map(), sql: `dashboard_api ${args?.endpoint}` };
  } catch (err) {
    log({ user: user.email, role: user.role, target: 'dashboard_api', allowed: true, error: err.message, duration: Date.now() - start });
    return { ok: false, text: `Dashboard endpoint call failed: ${String(err.message).slice(0, 300)}`, error: String(err.message).slice(0, 160) };
  }
}

const DASHBOARD_API_DESCRIPTION = `Read the numbers a dashboard page shows by calling the page's own /api endpoint (same params the page sends). USE THIS FIRST for any dashboard question (read knowledge ENDPOINT_MAP.md for which endpoint, params and paths answer which question). endpoint: one of ${Object.keys(DASH_ENDPOINTS).join(', ')}. params: the request body the page sends (e.g. {start,end} or {months:['2026-09']}). paths: dot-paths into the response ("a.b", "rows.*.sku"); describe:true returns the response structure instead. For arrays of rows you can add groupBy (field), sum (fields to add up), sortBy, limit (default 20, max 50: longer lists are cut and the TOTAL covers all rows). First call for given params can take up to ~60-90 s, repeats are cached 30 min. Read-only.`;

const PNL_TOOL_DESCRIPTION = 'P&L for ONE channel and period exactly as the dashboard P&L page computes it: gross, net revenue, COGS (and which COGS month is used), COGS %, gross margin, SnD, CM1, CM1 %, marketing %, CM2. Use for ANY P&L, COGS total, CM1, margin or marketing-% question. Arguments: channel (d2c, amazon, flipkart, ebo, offline, blinkit, zepto, instamart, cred, firstcry, myntra), month "YYYY-MM" OR start and end dates (IST), breakdown (true = also top/bottom product margins). Overall P&L is not available. Takes up to ~90 seconds on the first call for a period.';

const INVENTORY_COST_DESCRIPTION = 'Inventory valued at cost, exactly as the Inventory Health > "Inventory cost detail" card shows it (needs the Inventory Cost Detail permission). Use for: inventory value (₹) by product, SKU or category, units, DOI and status, which SKUs have no COGS (and what they are valued at), and which COGS month is used. Rule of the card: SKU value = own COGS x units; if the SKU has no COGS, the average COGS of its sub-category x units; if neither, not valued. Counts are SKUs with stock > 0 only. Every total, count and subtotal is calculated by the tool: copy them, never add rows yourself. Say which COGS month the rates come from (the tool states it, e.g. "Sep 2026, carried forward") and that stock is the Regular facilities of the Inventory Health page. Read-only.';

const INVENTORY_OPPORTUNITY_DESCRIPTION = 'Which sub-categories hold stock beyond N days of cover, to push for sale or liquidate (needs the Inventory Cost Detail permission). All numbers are calculated by the tool: same stock (Regular facilities) and same valuation as the Inventory cost card; per sub-category: SKUs, stock, value at cost, excess units (stock beyond cover_days x avg daily sale), excess value, DOI, 7-vs-30 and 30-vs-90 day sale trend, weighted ASP, COGS, margin per unit and max discount before loss %. Never-live SKUs (never sold), spare parts and covers are excluded (listed by name); Mobility and Ergo Furniture come as a separate high-value list; SKUs with stock but no COGS come as a separate "No COGS" list. mode "plan" returns the assumptions and exclusions to show the user BEFORE running (use it first when the user asks for questions / a plan before starting, or the request combines several criteria); mode "run" (default) returns the result and attaches an Excel with every SKU. Settings the user can change (pass only what they changed; the rest comes from the earlier Settings line of the chat, then the defaults): cover_days, top_n, channel (b2c or all), sales_days (7, 15, 30, 60, 90), min_doi, rank_by (excess_value, doi, stock_value), exclude_categories, exclude_sub_categories, include_categories, include_sub_categories, high_value_categories. Always copy the Settings line of the tool result into your reply unchanged. Read-only.';
const OPP_DEFAULTS = defaultSettings((() => { try { return JSON.parse(readKnowledge('liquidation-config.json')); } catch { return {}; } })());
const FIND_PRODUCT_DESCRIPTION = 'Match product words or a SKU code against the SKU master (sub-category = the product, product name, SKU code), case-insensitive. Returns every matching product with its SKUs, or says nothing matches and gives the closest names. The connector already runs this on the question and puts the result in front of it ("Product match"); call this tool only for a product word that is not in that block (for example one from an earlier message). Never pick one of several matches yourself.';

const CN_TOOL_DESCRIPTION = 'Credit notes (CN) received from couriers, FTL/PTL transporters and 3PL partners, exactly as the dashboard page Logistics > Cost Analytics > Overview > "CN Received" shows them: CN count, invoice value, received CN and received % of invoice, by format (B2C couriers, FTL/PTL, 3PL), by reason (weight dispute, lost/damage, SLA breach, high ageing, wrong invoicing, wrong billing), by partner and by invoice month. Use for ANY question about credit notes, CN received, CN vs invoice, weight-dispute or lost/damage CNs. Arguments: month "YYYY-MM" (one invoice month) OR from/to "YYYY-MM"; omit for all months. TOTALS ONLY: the page has no list of individual open/pending CNs and no ageing, so say that and do not invent them.';

const OOS_TOOL_DESCRIPTION = 'Out-of-stock SKUs and OOS loss exactly as the dashboard\'s Inventory Health > OOS loss page shows them (same SQL and maths). Use for ANY question about OOS / out-of-stock SKUs, loss of sales, days out of stock. Optional: limit (top N by loss, default 10) and sku (one SKU).';

function createMcpServer(user) {
  const server = new McpServer({ name: 'frido-data-connector', version: '1.0.0' });

  server.resource(
    'instructions',
    'frido://instructions',
    { mimeType: 'text/plain' },
    async () => ({
      contents: [{ uri: 'frido://instructions', text: buildSystemPrompt(), mimeType: 'text/plain' }],
    })
  );

  server.tool(
    'run_command',
    TOOL_DESCRIPTION,
    {
      command: z.string().describe('The SQL query or file command to run'),
      target: z.enum(['bigquery', 'supabase', 'repo']).describe('bigquery = sales/logistics/ads data, supabase = inventory data, repo = dashboard formula code on GitHub'),
    },
    async ({ command, target }) => {
      const result = await executeTool(user, command, target);
      return { content: [{ type: 'text', text: result.text }] };
    }
  );

  server.tool(
    'cn_received',
    CN_TOOL_DESCRIPTION,
    { month: z.string().optional(), from: z.string().optional(), to: z.string().optional() },
    async args => {
      const result = await executeCn(user, args, new Set());
      return { content: [{ type: 'text', text: result.text }] };
    }
  );

  server.tool(
    'oos_loss',
    OOS_TOOL_DESCRIPTION,
    { limit: z.number().optional(), sku: z.string().optional() },
    async args => {
      const result = await executeOos(user, args, new Set());
      return { content: [{ type: 'text', text: result.text }] };
    }
  );

  return server;
}

// A failure in one request must never take the whole instance down.
process.on('unhandledRejection', err => console.error('unhandledRejection', err));
process.on('uncaughtException', err => console.error('uncaughtException', err));

const PORT = process.env.PORT || 8080;

// Browsers may call /chat only from the dashboard origin (CORS_ORIGIN, comma-separated). api/pulse.js
// calls server-to-server and is not affected. Any other origin gets no CORS headers.
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'https://frido-navigator.vercel.app').split(',').map(o => o.trim()).filter(Boolean);
function setCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (origin && CORS_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
}

const httpServer = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', name: 'frido-data-connector' }));
    return;
  }

  if (req.url === '/mcp') {
    const authResult = await validateRequest(req).catch(() => ({
      ok: false, status: 500, message: 'Auth check failed. Try again later.'
    }));
    if (!authResult.ok) {
      res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: authResult.message }));
      return;
    }

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = createMcpServer(authResult.user);
    res.on('close', () => { server.close().catch(() => {}); });
    await server.connect(transport);
    await transport.handleRequest(req, res, await getBody(req));
    return;
  }

  if (req.method === 'OPTIONS' && req.url === '/chat') {
    setCors(req, res);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/chat') {
    setCors(req, res);

    const authResult = await validateRequest(req).catch(() => ({
      ok: false, status: 500, message: 'Auth check failed.'
    }));
    if (!authResult.ok) {
      res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: authResult.message }));
      return;
    }

    const body = await getBody(req);
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'messages array required' }));
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Anthropic API key not configured yet.' }));
      return;
    }

    const budget = checkBudget();
    if (!budget.ok) {
      await sendLimitEmail(authResult.user);
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Monthly AI budget of $300 has been reached. NavAI will resume next month. Contact data.team@myfrido.com to raise the limit.' }));
      return;
    }

    // The asking person's page access comes from api/pulse.js; without it (a direct call) NavAI gets no pages.
    const user = { ...authResult.user, access: normaliseAccess(body?.access) };

    // Files attached to the question (second check; api/pulse.js already did the first). Needs 'ask:files' (admins have it).
    const filesOk = checkAttachments(messages, user);
    if (!filesOk.ok) {
      res.writeHead(filesOk.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: filesOk.error }));
      return;
    }
    const attached = describeAttachments(messages);
    if (attached.length) log({ user: user.email, role: user.role, target: 'chat_files', allowed: true, files: attached }); // name, type, size only
    // dangerouslyAllowBrowser: this is a server; the SDK check only trips while the P&L tool's headless DOM globals exist.
    const anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    const lastUserMsg = String(messages[messages.length - 1]?.content ?? messages[messages.length - 1]?.text ?? '');
    // Model choice (lib/modelChoice.js): Sonnet by default; Opus for planning, file reasoning, and the number-check retry below.
    const lastAttached = Array.isArray(messages[messages.length - 1]?.attachments) ? messages[messages.length - 1].attachments : [];
    // Liquidation / push-for-sale analysis: plan and result are built in code (no writing model). A person without the permission is refused here, before any model call.
    let flow = detectFlow(messages);
    const flowUse = [];       // Sonnet usage of this answer's small calls (follow-up classifier, settings reader, explanation)
    if (flow?.mode === 'followup') {
      // A message after a plan / result: settings change -> re-run; question about the result -> explain (no re-run); unclear -> one line; unrelated -> normal path.
      const prior = flowMessageFromChat(messages.slice(0, -1));
      const c = await classifyFollowUp(anthropic, SONNET, lastUserMsg, mergeSettings(OPP_DEFAULTS, prior.settings).settings, prior.kind);
      if (c.usage) flowUse.push(c.usage);
      flow = c.kind === 'change' ? { mode: 'run', parse: false, args: c.args, kind: 'change' }
        : c.kind === 'question' ? { mode: 'explain', prior, kind: 'question' }
          : c.kind === 'unclear' ? { mode: 'ask', kind: 'unclear' }
            : (isLiquidationTopic(lastUserMsg) ? { mode: 'plan', parse: false, args: {}, kind: 'new request' } : null);
    } else if (flow?.mode === 'ack') flow.kind = 'ack';
    const denial = preflightDenial(user, lastUserMsg, flow?.mode === 'ack' ? null : flow);
    if (denial) {
      log({ user: user.email, role: user.role, target: 'chat_refused_no_permission', allowed: false });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: denial, sql: null, model: null, tableKeys: [], monthlySpend: parseFloat(getStats().totalCost.toFixed(4)) }));
      return;
    }
    const choice = chooseModel(lastUserMsg, lastAttached);
    const model = choice.model;
    const wantOpus = model === OPUS;

    const tools = [{
      name: 'run_command',
      description: TOOL_DESCRIPTION,
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'SQL query or shell command to run' },
          target: { type: 'string', enum: ['bigquery', 'supabase', 'repo'], description: 'Data source to query' },
        },
        required: ['command', 'target'],
      },
    }, {
      name: 'oos_loss',
      description: OOS_TOOL_DESCRIPTION,
      input_schema: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Top N SKUs by loss (default 10, max 50)' },
          sku: { type: 'string', description: 'One master SKU, e.g. FR-ERFT-B1' },
        },
      },
    }, {
      name: 'dashboard_api',
      description: DASHBOARD_API_DESCRIPTION,
      input_schema: {
        type: 'object',
        properties: {
          endpoint: { type: 'string', description: 'bq, logistics, inventory, inventory-oos, sales-allocation, inward, return-analysis, returns, customer, customer-support, cogs-monthly, cat-daily, courier-allocation, inv-data-7d, logistics-data-forward, logistics-cost-data, pnl-data-lastmonth, sales-alloc-data, inward-data, ads-data' },
          params: { type: 'object', description: 'Request body the page sends, e.g. {"start":"2026-09-01","end":"2026-09-30"}' },
          paths: { type: 'array', items: { type: 'string' }, description: 'Dot-paths into the response to return (max 8)' },
          describe: { type: 'boolean', description: 'Return the response structure instead of values' },
          groupBy: { type: 'string' }, sum: { type: 'array', items: { type: 'string' } }, sortBy: { type: 'string' },
          limit: { type: 'integer' },
          where: { type: 'object', description: 'Keep only array rows where field = value, e.g. {"stockStatus":"Critical"}' },
          regular: { description: 'inv-data files only: true or {sku, location} — Regular-facility stock per location (the Inventory Health Regular view)' },
        },
        required: ['endpoint'],
      },
    }, {
      name: 'inventory_opportunity',
      description: INVENTORY_OPPORTUNITY_DESCRIPTION,
      input_schema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['plan', 'run'], description: 'plan = assumptions and exclusions to confirm first; run = the result (default)' },
          cover_days: { type: 'number', description: 'Days of cover kept (default 60); stock beyond it is excess' },
          top_n: { type: 'integer', description: 'Sub-categories per list (default 20, max 50)' },
          channel: { type: 'string', enum: ['b2c', 'all'], description: 'Sales channel for the average (default b2c)' },
          sales_days: { type: 'integer', enum: [7, 15, 30, 60, 90], description: 'Days the average daily sale is taken over (default 30)' },
          min_doi: { type: 'number', description: 'Only include SKUs with at least this DOI (default none)' },
          rank_by: { type: 'string', enum: ['excess_value', 'doi', 'stock_value'] },
          exclude_categories: { type: 'array', items: { type: 'string' }, description: 'Replaces the excluded categories (the Settings line shows the current ones)' },
          exclude_sub_categories: { type: 'array', items: { type: 'string' } },
          include_categories: { type: 'array', items: { type: 'string' }, description: 'Only these categories' },
          include_sub_categories: { type: 'array', items: { type: 'string' }, description: 'Only these sub-categories' },
          high_value_categories: { type: 'array', items: { type: 'string' }, description: 'The separate high-value group (default Mobility, Ergo Furniture)' },
        },
      },
    }, {
      name: 'inventory_cost',
      description: INVENTORY_COST_DESCRIPTION,
      input_schema: {
        type: 'object',
        properties: {
          by: { type: 'string', enum: ['summary', 'product', 'sku', 'category', 'no_cogs'], description: 'summary = totals and the no-COGS split; product / sku / category = ranked list; no_cogs = SKUs without their own COGS' },
          category: { type: 'string', description: 'Only this category, e.g. Orthotics' },
          product: { type: 'string', description: 'Only this product = SKU-master sub-category, exactly as in the Product match block' },
          sku: { type: 'string', description: 'Only this SKU' },
          status: { type: 'string', description: 'Only rows with this status: Critical, Low, Sufficient, Excess, No Demand' },
          sortBy: { type: 'string', enum: ['value', 'units', 'doi', 'avgSale'], description: 'Default value (inventory value, high to low)' },
          limit: { type: 'integer', description: 'Rows to list (default 10, max 50)' },
        },
      },
    }, {
      name: 'find_product',
      description: FIND_PRODUCT_DESCRIPTION,
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'The product words or SKU code as the user wrote them, e.g. "knee cap" or "FR-OPC-L1"' } },
        required: ['query'],
      },
    }, {
      name: 'cn_received',
      description: CN_TOOL_DESCRIPTION,
      input_schema: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'One invoice month as YYYY-MM, e.g. 2026-10' },
          from: { type: 'string', description: 'First invoice month YYYY-MM (with to)' },
          to: { type: 'string', description: 'Last invoice month YYYY-MM' },
        },
      },
    }, {
      name: 'pnl',
      description: PNL_TOOL_DESCRIPTION,
      input_schema: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'd2c, amazon, flipkart, ebo, offline, blinkit, zepto, instamart, cred, firstcry or myntra' },
          month: { type: 'string', description: 'Calendar month as YYYY-MM, e.g. 2026-09' },
          start: { type: 'string', description: 'Start date YYYY-MM-DD (instead of month)' },
          end: { type: 'string', description: 'End date YYYY-MM-DD (instead of month)' },
          breakdown: { type: 'boolean', description: 'Also return top/bottom product margins' },
        },
        required: ['channel'],
      },
    }, {
      name: 'load_knowledge',
      description: 'Load the knowledge sections for a topic that the prompt says was left out (see "Knowledge not loaded"). Topics: ' + TOPICS.join(', ') + '. Returns the locked SQL / formulas for that topic. Not data: call it only when you need a formula or SQL that is not in your instructions.',
      input_schema: { type: 'object', properties: { topics: { type: 'array', items: { type: 'string', enum: TOPICS } } }, required: ['topics'] },
    }];

    if (flow) {
      try {
        const chatSet = settingsFromChat(messages);
        const files = [];
        let text, tableKeys = [];
        if (flow.mode === 'ack') text = ACK_LINE;
        else if (flow.mode === 'ask') text = ASK_LINE;
        else if (flow.mode === 'explain') {
          const a = await answerQuestion(anthropic, SONNET, lastUserMsg, flow.prior);
          if (a.usage) flowUse.push(a.usage);
          text = a.text;
        } else {
          let args = flow.args || {};
          if (flow.parse) { const p = await parseSettingChange(anthropic, SONNET, lastUserMsg, chatSet || OPP_DEFAULTS); args = p.args; if (p.usage) flowUse.push(p.usage); }
          const r = await executeInventoryOpportunity(user, { ...args, mode: flow.mode }, chatSet, files, true);
          text = r.ok || r.denied ? r.text : `${r.text}\n\nNothing could be computed, so there is no list yet. Try again in a few minutes, or contact data.team@myfrido.com.`;
          if (r.ok) tableKeys = phoneHints(text, mergeSettings(OPP_DEFAULTS, chatSet, args).settings);
        }
        const use = flowUse.reduce((a, u) => ({ input_tokens: a.input_tokens + (u.input_tokens || 0), output_tokens: a.output_tokens + (u.output_tokens || 0), cache_read_input_tokens: a.cache_read_input_tokens + (u.cache_read_input_tokens || 0), cache_creation_input_tokens: a.cache_creation_input_tokens + (u.cache_creation_input_tokens || 0) }), { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
        if (flowUse.length) await trackUsage({ model: SONNET, inputTokens: use.input_tokens, outputTokens: use.output_tokens, cacheRead: use.cache_read_input_tokens, cacheWrite: use.cache_creation_input_tokens, user }).catch(() => {});
        log({ user: user.email, role: user.role, target: 'chat_usage', allowed: true, model: flowUse.length ? SONNET : null, steps: 0, why: `liquidation_${flow.mode}${flow.kind ? `_${flow.kind}` : ''}`, small_calls: flowUse.length, input_tokens: use.input_tokens, output_tokens: use.output_tokens, cache_read_tokens: use.cache_read_input_tokens, cache_write_tokens: use.cache_creation_input_tokens });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text, sql: null, model: flowUse.length ? SONNET : null, tableKeys, ...(files.length ? { files: files.slice(-1) } : {}), ...(body?.debugUsage === true ? { usage: flowUse.length ? { [SONNET]: { input: use.input_tokens, output: use.output_tokens, cache_read: use.cache_read_input_tokens, cache_write: use.cache_creation_input_tokens } } : {}, per_request: [], flow: `${flow.mode}${flow.kind ? `/${flow.kind}` : ''}`, small_calls: flowUse.length, topics: ['liquidation_flow'] } : {}), monthlySpend: parseFloat(getStats().totalCost.toFixed(4)) }));
      } catch (err) {
        console.error('Liquidation flow error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'The stock analysis failed. Please try again.' }));
      }
      return;
    }

    try {
      let loopMessages = messages.map(m => ({ role: m.role, content: buildContent(m) }));
      const { block: matchBlock, computed } = await productMatchBlock(messages, user);
      const userTexts = messages.filter(m => m.role === 'user').map(m => String(m.content ?? m.text ?? '')).slice(-4);
      const { blocks: systemBlocks, kb } = buildSystemBlocks(userTexts);
      const chatSettings = settingsFromChat(messages); // analysis settings the user chose earlier in this chat (from the Settings line of our last answer)
      const outFiles = [];      // files made by tools (the Excel of inventory_opportunity), sent back with the answer
      const toolTexts = [];     // everything the tools returned: the only numbers an answer may contain
      let lastTsv = '';         // the last table a tool returned (used to rebuild a table if the answer's numbers do not check out)
      if (computed) toolTexts.push(computed.text);
      if (matchBlock && loopMessages.length && loopMessages[loopMessages.length - 1].role === 'user') {
        const last = loopMessages[loopMessages.length - 1];
        last.content = Array.isArray(last.content) ? [{ type: 'text', text: matchBlock }, ...last.content] : `${matchBlock}

${last.content}`;
      }
      let finalText = '';
      let usedSql = null;
      let iterations = 0;
      // Per-question state: denial cap, SKU names from the master, sync notes, what was tried.
      let denials = 0;
      let forceFinal = false;
      let queriesRun = 0;
      let queryErrors = 0;
      let lastProblem = '';
      const seenSkus = new Map();
      const seenFormatted = new Set();
      const syncNotes = new Set();
      const usageBy = {};       // model -> { input, output } for this answer
      const stepUse = [];       // per request: model, input, output, cache read/write (debugUsage + chat_usage log; no text)
      const addUse = (m, u) => { stepUse.push([m === OPUS ? 'O' : 'S', u?.input_tokens || 0, u?.output_tokens || 0, u?.cache_read_input_tokens || 0, u?.cache_creation_input_tokens || 0].join(':')); const x = usageBy[m] || (usageBy[m] = { input: 0, output: 0, cache_read: 0, cache_write: 0 }); x.input += u?.input_tokens || 0; x.output += u?.output_tokens || 0; x.cache_read += u?.cache_read_input_tokens || 0; x.cache_write += u?.cache_creation_input_tokens || 0; };

      // At most 6 steps in the tool loop (12 for planning / analysis questions); a repeated identical tool call in the same answer reuses the result already fetched.
      const MAX_STEPS = choice.steps;
      const failures = [];      // "tool: reason" for every tool call that failed, shown when nothing could be computed
      let lastStop = '';
      const reuse = new Map();
      while (iterations < MAX_STEPS) {
        iterations++;
        const reqParams = {
          model,
          max_tokens: wantOpus ? 16000 : 8192,
          system: systemBlocks,
          tools,
          tool_choice: forceFinal ? { type: 'none' } : (iterations === 1 ? { type: 'any' } : { type: 'auto' }),
          messages: withCache(loopMessages),
        };
        if (wantOpus) reqParams.thinking = { type: 'adaptive' };
        const response = await anthropic.messages.create(reqParams);

        addUse(model, response.usage);

        for (const block of response.content) {
          if (block.type === 'text') finalText = block.text;
          if (block.type === 'tool_use') usedSql = block.input?.command || (block.name === 'oos_loss' ? 'oos_loss' : block.name === 'cn_received' ? 'cn_received' : block.name === 'pnl' ? 'pnl' : block.name === 'dashboard_api' ? 'dashboard_api' : usedSql);
        }

        lastStop = response.stop_reason;
        if (response.stop_reason !== 'tool_use') break;

        // Execute tool calls using the same executeTool() as MCP
        const toolResults = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          const { command, target } = block.input;
          const reuseKey = block.name === 'find_product' || block.name === 'load_knowledge' ? null : `${block.name}:${JSON.stringify(block.input)}`;
          const result = reuseKey && reuse.has(reuseKey) ? reuse.get(reuseKey) : block.name === 'load_knowledge'
            ? { ok: true, text: sectionsForTopics(KNOWLEDGE_FILES, block.input?.topics) }
            : block.name === 'oos_loss'
            ? await executeOos(user, block.input, seenFormatted)
            : block.name === 'find_product'
              ? await executeFindProduct(block.input)
            : block.name === 'inventory_opportunity'
              ? await executeInventoryOpportunity(user, block.input, chatSettings, outFiles)
            : block.name === 'inventory_cost'
              ? await executeInventoryCost(user, block.input)
            : block.name === 'cn_received'
              ? await executeCn(user, block.input, seenFormatted)
            : block.name === 'pnl'
              ? await executePnl(user, block.input, seenFormatted)
              : block.name === 'dashboard_api'
                ? await executeDashboardApi(user, block.input, seenFormatted)
                : await executeTool(user, command, target, seenFormatted);
          if (reuseKey && result.ok && !result.denied) reuse.set(reuseKey, result);
          queriesRun++;
          let content = result.text;
          if (result.denied) {
            denials++;
            lastProblem = `denied: ${String(result.text).slice(0, 120)}`;
            content = `DENIED: ${result.text}. Do not retry this; use another route (the locked templates, other allowed tables, or your own logic labelled "Custom calculation, not from the dashboard:").`;
          } else if (!result.ok) {
            queryErrors++;
            lastProblem = result.error || 'query failed';
            failures.push(`${block.name}: ${String(result.error || result.text || 'failed').slice(0, 140)}`);
          }
          if (result.ok && !result.denied && typeof result.text === 'string') {
            if (block.name !== 'load_knowledge') toolTexts.push(result.text);
            if (block.name !== 'find_product' && block.name !== 'load_knowledge' && /\n[^\n]*\t/.test(result.text)) lastTsv = result.text;
          }
          if (result.skus) for (const [k, v] of result.skus) seenSkus.set(k, v);
          if (result.note) syncNotes.add(result.note);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content,
            is_error: !result.ok,
          });
        }
        // Max 2 denials per question, then answer with what we have.
        if (denials >= 2 && !forceFinal) {
          forceFinal = true;
          toolResults.push({ type: 'text', text: 'Two requests were denied. Stop calling tools and answer now with what you already have. If you must use your own logic, start with "Custom calculation, not from the dashboard:" and the definition in one line.' });
        }

        loopMessages = [
          ...loopMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ];
      }

      // If the loop used all its steps while still asking for tools, the answer is written now from what was collected
      // (text written between tool calls is not an answer).
      if ((lastStop === 'tool_use' || !finalText) && loopMessages.length > messages.length) {
        const lastMsg = loopMessages[loopMessages.length - 1];
        const closing = { type: 'text', text: 'You have used all your tool steps. Write the answer now from the results you already have (do not call tools). Show everything that was computed; if something is missing, say exactly which data is missing or failed.' };
        const forced = lastMsg.role === 'user' && Array.isArray(lastMsg.content) ? [...loopMessages.slice(0, -1), { ...lastMsg, content: [...lastMsg.content, closing] }] : loopMessages;
        if (lastStop === 'tool_use') finalText = '';
        const finalResponse = await anthropic.messages.create({
          model,
          max_tokens: 4096,
          system: systemBlocks,
          tools,
          tool_choice: { type: 'none' },
          messages: forced,
        }).catch(() => null);
        if (finalResponse) {
          addUse(model, finalResponse.usage);
          for (const block of finalResponse.content) {
            if (block.type === 'text') finalText = block.text;
          }
        }
      }

      // Product names must be the SKU master's sub-category. If the answer shows a different name for a
      // SKU, send it back once with the correct names.
      if (finalText && seenSkus.size) {
        const bad = wrongNames(finalText, seenSkus);
        if (bad.length) {
          const fix = [...new Map(bad.map(b => [b.sku, b.want])).entries()].map(([k, v]) => `${k} = ${v}`).join('; ');
          const retry = await anthropic.messages.create({
            model,
            max_tokens: 4096,
            system: systemBlocks,
            tools,
            tool_choice: { type: 'none' },
            messages: [
              ...loopMessages,
              { role: 'assistant', content: finalText },
              { role: 'user', content: `Some product names in your answer are not the SKU master's sub-category. Rewrite the same answer using exactly these names (never invent a product name): ${fix}. Output only the corrected answer; do not mention this instruction or apologise.` },
            ],
          }).catch(() => null);
          if (retry) {
            addUse(model, retry.usage);
            for (const block of retry.content) if (block.type === 'text') finalText = block.text;
          }
        }
      }

      // Safety net: a rupee amount, or a bare number >= 1,00,000, that is not one of the connector's formatted
      // values is sent back once (the model must copy formatted values, never convert units itself).
      if (finalText && seenFormatted.size) {
        const odd = unformattedNumbers(finalText, seenFormatted);
        if (odd.length) {
          const retry = await anthropic.messages.create({
            model,
            max_tokens: 4096,
            system: systemBlocks,
            tools,
            tool_choice: { type: 'none' },
            messages: [
              ...loopMessages,
              { role: 'assistant', content: finalText },
              { role: 'user', content: `These numbers in your answer are not values the connector formatted: ${odd.slice(0, 12).join(', ')}. Rewrite the same answer using only the formatted values exactly as they appear in the results (never convert units yourself). If a number is a total you computed, take it from the query result instead, or say it is a computed figure. Output only the corrected answer; do not mention this instruction, an error or an apology.` },
            ],
          }).catch(() => null);
          if (retry) {
            addUse(model, retry.usage);
            for (const block of retry.content) if (block.type === 'text') finalText = block.text;
          }
        }
      }

      // Every number in the answer must come from a tool result (formatting like 66,074 / 66.07K / ₹1.5 L is fine). The model may
      // not add or work out numbers itself. One rewrite is allowed; if numbers still do not check out, the answer's table is
      // replaced by the computed one (or the table of the last tool result) and the lines with unchecked numbers are dropped.
      // Logged without the question or any file content: only counts. Skipped when a picture/PDF was attached (its numbers
      // cannot be read here) or when no tool was used.
      if (finalText && (toolTexts.length || computed)) {
        const hasBinary = messages.some(m => Array.isArray(m.attachments) && m.attachments.some(a => a.type === 'image' || a.type === 'pdf'));
        const attachedText = messages.flatMap(m => (Array.isArray(m.attachments) ? m.attachments.filter(a => a.type === 'text').map(a => String(a.data)) : []));
        const userText = messages.filter(m => m.role === 'user').map(m => String(m.content ?? m.text ?? ''));
        const known = knownNumbers([...toolTexts, ...attachedText, ...userText, matchBlock || '']);
        let odd = hasBinary ? [] : unverified(finalText, known);
        // Rewrite with the same model first; if the numbers still do not check out, one last rewrite with Opus.
        const rewrite = async m => {
          const retry = await anthropic.messages.create({
            model: m,
            max_tokens: 4096,
            system: systemBlocks,
            tools,
            tool_choice: { type: 'none' },
            messages: [
              ...loopMessages,
              { role: 'assistant', content: finalText },
              { role: 'user', content: `These numbers in your answer are not in the tool results: ${odd.slice(0, 12).join(', ')}. You must not add, subtract, divide, round or compare numbers yourself. Rewrite the same answer using only numbers that appear in the tool results (totals, percentages and comparisons are given there); if a number you wanted is not given, leave it out or say it is not available. Output only the corrected answer; do not mention this instruction.` },
            ],
          }).catch(() => null);
          if (retry) {
            addUse(m, retry.usage);
            for (const block of retry.content) if (block.type === 'text') finalText = block.text;
            odd = unverified(finalText, known);
          }
        };
        if (odd.length) await rewrite(model);
        if (odd.length && model !== OPUS) { log({ user: user.email, role: user.role, target: 'answer_numbers_opus_retry', allowed: true, unchecked: odd.length, sample: odd.slice(0, 6) }); await rewrite(OPUS); }
        if (odd.length) {
          let replaced = 'none';
          if (computed) { finalText = computed.text; replaced = computed.kind; }
          else if (lastTsv) {
            const md = tsvToMarkdown(lastTsv);
            if (md) { finalText = replaceTables(finalText, md); replaced = 'last_tool_table'; }
            const oddSet = new Set(unverified(finalText, known));
            if (oddSet.size) finalText = finalText.split('\n').filter(l => /^\s*\|/.test(l) || !unverified(l, known).length).join('\n');
          } else {
            finalText = finalText.split('\n').filter(l => !unverified(l, known).length).join('\n');
            replaced = 'dropped_lines';
          }
          log({ user: user.email, role: user.role, target: 'answer_numbers_replaced', allowed: true, unchecked: odd.length, replaced });
        }
      }

      // Cost per answer: one line with the model(s) used and the tokens (no question text), and the spend tracker per model.
      for (const [m, u] of Object.entries(usageBy)) await trackUsage({ model: m, inputTokens: u.input, outputTokens: u.output, cacheRead: u.cache_read, cacheWrite: u.cache_write, user }).catch(() => {});
      log({ user: user.email, role: user.role, target: 'chat_usage', allowed: true, model, models: Object.keys(usageBy), input_tokens: Object.values(usageBy).reduce((x, u) => x + u.input, 0), output_tokens: Object.values(usageBy).reduce((x, u) => x + u.output, 0), cache_read_tokens: Object.values(usageBy).reduce((x, u) => x + u.cache_read, 0), cache_write_tokens: Object.values(usageBy).reduce((x, u) => x + u.cache_write, 0), steps: iterations, topics: kb.topics.join(','), by_model: usageBy, per_request: stepUse.join(' '), why_opus: wantOpus ? choice.why : (usageBy[OPUS] ? 'number_check_retry' : null) });

      // Never "nothing usable came back" when something was computed: show the last table the tools returned, and say what is missing.
      if (!finalText && lastTsv) {
        const md = tsvToMarkdown(lastTsv, 50);
        if (md) finalText = `I could not finish writing the summary, but this is the last result I computed from the data:\n\n${md}\n\n${failures.length ? `Data that failed: ${[...new Set(failures)].join('; ')}.\n\n` : ''}Ask me to continue and I will pick up from here.`;
      }
      if (!finalText) {
        // One line: what was tried and what is missing — never a bare "query failed".
        const tried = queriesRun
          ? `I ran ${queriesRun} data ${queriesRun === 1 ? 'request' : 'requests'}${denials ? ` (${denials} denied)` : ''}${queryErrors ? ` (${queryErrors} failed)` : ''}`
          : 'I could not start a data query';
        const missing = failures.length ? `; data that failed: ${[...new Set(failures)].join('; ')}. Nothing was computed, so I can't give a number yet.` : lastProblem ? `; the last problem was: ${lastProblem}. Missing: a usable result, so I can't give a number yet.` : '; every request ran but returned no rows, so there is nothing to show yet.';
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `${tried}${missing} Try again, or contact data.team@myfrido.com.` }));
        return;
      }

      // Never present a partial day as final: one code-added line, whatever the model wrote.
      if (syncNotes.size && !/still syncing/i.test(finalText)) finalText += `\n\n${[...syncNotes].join(' ')}`;

      // A Total row is never empty (the connector's own totals fill it) and each table's key column is marked for the phone view.
      finalText = fillTotals(finalText, toolTexts, lastUserMsg);
      const tableKeys = keyColumns(lastUserMsg, finalText);

      const stats = getStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: finalText, sql: usedSql, model: usageBy[OPUS] ? OPUS : model, tableKeys, ...(outFiles.length ? { files: outFiles.slice(-1) } : {}), ...(body?.debugUsage === true ? { usage: usageBy, per_request: stepUse, topics: kb.topics } : {}), monthlySpend: parseFloat(stats.totalCost.toFixed(4)) }));
    } catch (err) {
      console.error('Chat error:', err);
      if (isBillingError(err)) {
        // Credits / billing / quota: say so plainly and alert the team (once per hour).
        alertBilling(err, authResult.user).catch(() => {});
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: UNAVAILABLE_MESSAGE }));
        return;
      }
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Chat failed. Please try again.' }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

function getBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      try { resolve(JSON.parse(raw)); } catch { resolve(undefined); }
    });
  });
}

httpServer.listen(PORT, () => {
  console.log(`frido-data-connector listening on port ${PORT}`);
});
