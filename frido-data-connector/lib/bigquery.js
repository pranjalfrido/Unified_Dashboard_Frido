import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

let _bq;
function getBQ() {
  if (_bq) return _bq;
  const keyPath = process.env.GCP_SA_KEY_FILE;
  const keyJson = process.env.GCP_SA_KEY;
  if (keyJson) {
    const key = JSON.parse(keyJson);
    _bq = new BigQuery({ projectId: key.project_id, credentials: key });
  } else if (keyPath) {
    const key = JSON.parse(readFileSync(keyPath, 'utf8'));
    _bq = new BigQuery({ projectId: key.project_id, keyFilename: keyPath });
  } else {
    throw new Error('No BigQuery credentials: set GCP_SA_KEY or GCP_SA_KEY_FILE');
  }
  return _bq;
}

const MAX_BYTES_BILLED = 20 * 1024 * 1024 * 1024; // 20 GB cap per query

// Text-level guard, independent of lib/safety.js so it still holds if a caller skips that check:
// exactly one statement, and it must be a SELECT or a WITH ... SELECT.
const BLOCKED_KEYWORDS = /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|ALTER|TRUNCATE)\b/i;

export function guardSql(sql) {
  // Drop string literals and comments so a ';' or keyword inside them doesn't count.
  const code = String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/#[^\n]*/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`/g, "''")
    .trim();
  if (/;\s*\S/.test(code)) throw new Error('Blocked: multiple statements are not permitted.');
  if (!/^\(*\s*(SELECT|WITH)\b/i.test(code)) throw new Error('Blocked: only SELECT or WITH ... SELECT queries are permitted.');
  const bad = code.match(BLOCKED_KEYWORDS);
  if (bad) throw new Error(`Blocked: ${bad[1].toUpperCase()} is not permitted.`);
}

export async function runBigQuery(sql) {
  guardSql(sql);
  const bq = getBQ();

  // Dry run: BigQuery itself reports the statement type. Reject anything but a plain SELECT
  // (a multi-statement script reports SCRIPT). Nothing is executed or billed.
  const [dry] = await bq.createQueryJob({ query: sql, dryRun: true, useLegacySql: false });
  const stmtType = dry.metadata?.statistics?.query?.statementType;
  if (stmtType !== 'SELECT') {
    throw new Error(`Blocked: statement type ${stmtType || 'unknown'} is not permitted (SELECT only).`);
  }

  const [job] = await bq.createQueryJob({
    query: sql,
    maximumBytesBilled: String(MAX_BYTES_BILLED),
    useLegacySql: false,
  });
  const [rows] = await job.getQueryResults();
  if (rows.length === 0) return 'No rows returned.';
  // Return as pretty table string (first 500 rows)
  const capped = rows.slice(0, 500);
  const headers = Object.keys(capped[0]);
  const lines = [
    headers.join('\t'),
    ...capped.map(r => headers.map(h => {
      const v = r[h];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'object' && v.value !== undefined) return v.value; // BigQuery date/numeric
      return String(v);
    }).join('\t')),
  ];
  if (rows.length > 500) lines.push(`\n[Showing 500 of ${rows.length} rows]`);
  return lines.join('\n');
}
