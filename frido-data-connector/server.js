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
import { writeAuditLog } from './lib/audit.js';
import { checkBudget, trackUsage, sendLimitEmail, getStats } from './lib/costTracker.js';
import { formatTsv } from './lib/format.js';
import { normalizeSql, datesBlock } from './lib/dates.js';
import { enrichSkus, wrongNames } from './lib/skuMaster.js';
import { freshnessNote } from './lib/freshness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readKnowledge = name => {
  try { return readFileSync(path.join(__dirname, 'knowledge', name), 'utf8'); } catch { return ''; }
};
// KNOWLEDGE_FILE (tests only) points at a candidate CLAUDE.md instead of knowledge/CLAUDE.md.
const CORE = process.env.KNOWLEDGE_FILE ? readFileSync(process.env.KNOWLEDGE_FILE, 'utf8') : readKnowledge('CLAUDE.md');
const KNOWLEDGE = [CORE, readKnowledge('PULSE_PLAYBOOK.md'), readKnowledge('PULSE_METRICS.md')].filter(Boolean).join('\n\n---\n\n');

const TOOL_DESCRIPTION = `Run a read-only command against Frido live data. Use for ANY Frido business question — stock, revenue, returns, logistics, courier, ads, or any metric.
- target=bigquery → SQL query against BigQuery tables
- target=supabase → SQL query against Supabase tables
- target=repo → cat/ls/head/grep to read dashboard formula code from GitHub`;

function buildSystemPrompt() {
  return `${datesBlock()}

You have access to the run_command tool which connects to Frido's live business data. NEVER answer business questions from memory — always use run_command to query live data first.

${KNOWLEDGE}`;
}

// Single tool executor — used by both MCP and /chat.
// Returns { ok, text, denied?, skus?, note?, sql? }. `denied` = refused by the authorization or safety
// layer (not a query error); /chat counts these and tells the model not to retry.
async function executeTool(user, command, target) {
  const start = Date.now();
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
      text = formatTsv(text);
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

  return server;
}

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
      res.end(JSON.stringify({ error: 'Monthly AI budget of $300 has been reached. Frido Pulse will resume next month. Contact data.team@myfrido.com to raise the limit.' }));
      return;
    }

    const user = authResult.user;
    const anthropic = new Anthropic({ apiKey });

    const lastUserMsg = messages[messages.length - 1]?.content ?? messages[messages.length - 1]?.text ?? '';
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
    }];

    try {
      let loopMessages = messages.map(m => ({ role: m.role, content: m.content ?? m.text }));
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
          if (block.type === 'tool_use' && block.input?.command) usedSql = block.input.command;
        }

        if (response.stop_reason !== 'tool_use') break;

        // Execute tool calls using the same executeTool() as MCP
        const toolResults = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          const { command, target } = block.input;
          const result = await executeTool(user, command, target);
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
              { role: 'user', content: `Some product names in your answer are not the SKU master's sub-category. Rewrite the same answer using exactly these names (never invent a product name): ${fix}` },
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
