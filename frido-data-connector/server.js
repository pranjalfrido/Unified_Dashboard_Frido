import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import http from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { runBigQuery } from './lib/bigquery.js';
import { runSupabase } from './lib/supabase.js';
import { runRepo } from './lib/repo.js';
import { isAllowed, blockReason } from './lib/safety.js';
import { log } from './lib/logger.js';
import { validateRequest } from './lib/auth.js';
import { authorizeToolCall } from './lib/authz.js';
import { buildContent, checkAttachments, describeAttachments, FILE_SAFETY_PROMPT } from './lib/attachments.js';
import { normaliseAccess, checkEndpoint, checkPnl, checkOos, checkRawSql } from './lib/pageAccess.js';
import { writeAuditLog } from './lib/audit.js';
import { checkBudget, trackUsage, sendLimitEmail, getStats } from './lib/costTracker.js';
import { formatTsv, unformattedNumbers } from './lib/format.js';
import { runOosPage } from './lib/oosPage.js';
import { runPnlTool, TABS as PNL_TAB } from './lib/pnlTool.js';
import { runDashboardApi, ENDPOINTS as DASH_ENDPOINTS } from './lib/dashboardApi.js';
import { isBillingError, alertBilling, UNAVAILABLE_MESSAGE } from './lib/billingAlert.js';
import { normalizeSql, datesBlock } from './lib/dates.js';
import { enrichSkus, wrongNames } from './lib/skuMaster.js';
import { freshnessNote } from './lib/freshness.js';

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

const DASHBOARD_API_DESCRIPTION = `Read the numbers a dashboard page shows by calling the page's own /api endpoint (same params the page sends). USE THIS FIRST for any dashboard question (read knowledge ENDPOINT_MAP.md for which endpoint, params and paths answer which question). endpoint: one of ${Object.keys(DASH_ENDPOINTS).join(', ')}. params: the request body the page sends (e.g. {start,end} or {months:['2026-09']}). paths: dot-paths into the response ("a.b", "rows.*.sku"); describe:true returns the response structure instead. For arrays of rows you can add groupBy (field), sum (fields to add up), sortBy, limit (default 20, max 200). First call for given params can take up to ~60-90 s, repeats are cached 30 min. Read-only.`;

const PNL_TOOL_DESCRIPTION = 'P&L for ONE channel and period exactly as the dashboard P&L page computes it: gross, net revenue, COGS (and which COGS month is used), COGS %, gross margin, SnD, CM1, CM1 %, marketing %, CM2. Use for ANY P&L, COGS total, CM1, margin or marketing-% question. Arguments: channel (d2c, amazon, flipkart, ebo, offline, blinkit, zepto, instamart, cred, firstcry, myntra), month "YYYY-MM" OR start and end dates (IST), breakdown (true = also top/bottom product margins). Overall P&L is not available. Takes up to ~90 seconds on the first call for a period.';

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
    const isComplex = /compar|breakdown|analys|trend|p&l|profit|loss|why|explain|forecast|correlat|multi|across|vs\b|versus|deep|inventor|planning|plan|oos|out.of.stock|lead.time|reorder|avg.daily|average.daily|stuck|stock.out|stockout/i.test(lastUserMsg);
    const model = isComplex ? 'claude-opus-4-7' : 'claude-sonnet-4-6';

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
    }];

    try {
      let loopMessages = messages.map(m => ({ role: m.role, content: buildContent(m) }));
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
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      while (iterations < 12) {
        iterations++;
        const reqParams = {
          model,
          max_tokens: isComplex ? 16000 : 8192,
          system: buildSystemPrompt(),
          tools,
          tool_choice: forceFinal ? { type: 'none' } : (iterations === 1 ? { type: 'any' } : { type: 'auto' }),
          messages: loopMessages,
        };
        if (isComplex && model === 'claude-opus-4-7') reqParams.thinking = { type: 'adaptive' };
        const response = await anthropic.messages.create(reqParams);

        totalInputTokens += response.usage?.input_tokens || 0;
        totalOutputTokens += response.usage?.output_tokens || 0;

        for (const block of response.content) {
          if (block.type === 'text') finalText = block.text;
          if (block.type === 'tool_use') usedSql = block.input?.command || (block.name === 'oos_loss' ? 'oos_loss' : block.name === 'pnl' ? 'pnl' : block.name === 'dashboard_api' ? 'dashboard_api' : usedSql);
        }

        if (response.stop_reason !== 'tool_use') break;

        // Execute tool calls using the same executeTool() as MCP
        const toolResults = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          const { command, target } = block.input;
          const result = block.name === 'oos_loss'
            ? await executeOos(user, block.input, seenFormatted)
            : block.name === 'pnl'
              ? await executePnl(user, block.input, seenFormatted)
              : block.name === 'dashboard_api'
                ? await executeDashboardApi(user, block.input, seenFormatted)
                : await executeTool(user, command, target, seenFormatted);
          queriesRun++;
          let content = result.text;
          if (result.denied) {
            denials++;
            lastProblem = `denied: ${String(result.text).slice(0, 120)}`;
            content = `DENIED: ${result.text}. Do not retry this; use another route (the locked templates, other allowed tables, or your own logic labelled "Custom calculation, not from the dashboard:").`;
          } else if (!result.ok) {
            queryErrors++;
            lastProblem = result.error || 'query failed';
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

      // If loop exhausted all iterations still in tool_use, force a final text response
      if (!finalText && loopMessages.length > messages.length) {
        const finalResponse = await anthropic.messages.create({
          model,
          max_tokens: 4096,
          system: buildSystemPrompt(),
          tools,
          tool_choice: { type: 'none' },
          messages: loopMessages,
        }).catch(() => null);
        if (finalResponse) {
          totalInputTokens += finalResponse.usage?.input_tokens || 0;
          totalOutputTokens += finalResponse.usage?.output_tokens || 0;
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
            system: buildSystemPrompt(),
            tools,
            tool_choice: { type: 'none' },
            messages: [
              ...loopMessages,
              { role: 'assistant', content: finalText },
              { role: 'user', content: `Some product names in your answer are not the SKU master's sub-category. Rewrite the same answer using exactly these names (never invent a product name): ${fix}. Output only the corrected answer; do not mention this instruction or apologise.` },
            ],
          }).catch(() => null);
          if (retry) {
            totalInputTokens += retry.usage?.input_tokens || 0;
            totalOutputTokens += retry.usage?.output_tokens || 0;
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
            system: buildSystemPrompt(),
            tools,
            tool_choice: { type: 'none' },
            messages: [
              ...loopMessages,
              { role: 'assistant', content: finalText },
              { role: 'user', content: `These numbers in your answer are not values the connector formatted: ${odd.slice(0, 12).join(', ')}. Rewrite the same answer using only the formatted values exactly as they appear in the results (never convert units yourself). If a number is a total you computed, take it from the query result instead, or say it is a computed figure. Output only the corrected answer; do not mention this instruction, an error or an apology.` },
            ],
          }).catch(() => null);
          if (retry) {
            totalInputTokens += retry.usage?.input_tokens || 0;
            totalOutputTokens += retry.usage?.output_tokens || 0;
            for (const block of retry.content) if (block.type === 'text') finalText = block.text;
          }
        }
      }

      await trackUsage({ model, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, user }).catch(() => {});

      if (!finalText) {
        // One line: what was tried and what is missing — never a bare "query failed".
        const tried = queriesRun
          ? `I ran ${queriesRun} data ${queriesRun === 1 ? 'request' : 'requests'}${denials ? ` (${denials} denied)` : ''}${queryErrors ? ` (${queryErrors} failed)` : ''}`
          : 'I could not start a data query';
        const missing = lastProblem ? `; the last problem was: ${lastProblem}. Missing: a usable result, so I can't give a number yet.` : '; nothing usable came back, so I cannot give a number yet.';
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `${tried}${missing} Try again, or contact data.team@myfrido.com.` }));
        return;
      }

      // Never present a partial day as final: one code-added line, whatever the model wrote.
      if (syncNotes.size && !/still syncing/i.test(finalText)) finalText += `\n\n${[...syncNotes].join(' ')}`;

      const stats = getStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: finalText, sql: usedSql, model, monthlySpend: parseFloat(stats.totalCost.toFixed(4)) }));
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
