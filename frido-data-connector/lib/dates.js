// All "today / yesterday / this week …" logic lives here, in IST (Asia/Kolkata), so the model never
// computes dates itself. PULSE_NOW (ISO string) overrides the clock for tests only.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function nowInstant() {
  return process.env.PULSE_NOW ? new Date(process.env.PULSE_NOW) : new Date();
}

// A Date whose UTC fields hold the IST wall-clock time.
function istWall(now = nowInstant()) {
  return new Date(now.getTime() + IST_OFFSET_MS);
}

const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

export function istDates(now = nowInstant()) {
  const w = istWall(now);
  const today = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()));
  const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = addDays(today, -dow);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = new Date(Date.UTC(lastMonthEnd.getUTCFullYear(), lastMonthEnd.getUTCMonth(), 1));
  return {
    now_ist: `${iso(today)} ${w.toISOString().slice(11, 16)} IST`,
    today: iso(today),
    yesterday: iso(addDays(today, -1)),
    week_start: iso(weekStart),
    week_end: iso(addDays(weekStart, 6)),
    last_week_start: iso(addDays(weekStart, -7)),
    last_week_end: iso(addDays(weekStart, -1)),
    month_start: iso(monthStart),
    last_month_start: iso(lastMonthStart),
    last_month_end: iso(lastMonthEnd),
    last_7_start: iso(addDays(today, -6)),
    last_30_start: iso(addDays(today, -29)),
    mature_start: iso(addDays(today, -43)),
    mature_end: iso(addDays(today, -14)),
  };
}

export function datesBlock(now = nowInstant()) {
  const d = istDates(now);
  return `## Dates — computed by the connector in IST (Asia/Kolkata). Use these literal dates; never work out dates yourself.
Now: ${d.now_ist}
| Phrase | From | To |
|---|---|---|
| today | ${d.today} | ${d.today} |
| yesterday | ${d.yesterday} | ${d.yesterday} |
| this week (Mon–Sun, to date) | ${d.week_start} | ${d.today} |
| last week (Mon–Sun) | ${d.last_week_start} | ${d.last_week_end} |
| this month (to date) | ${d.month_start} | ${d.today} |
| last month | ${d.last_month_start} | ${d.last_month_end} |
| last 7 days | ${d.last_7_start} | ${d.today} |
| last 30 days | ${d.last_30_start} | ${d.today} |
| mature window (return rates) | ${d.mature_start} | ${d.mature_end} |
If a query needs the current date inside SQL, use CURRENT_DATE('Asia/Kolkata') (BigQuery) — the connector also rewrites a bare CURRENT_DATE().`;
}

// Force IST in any SQL the model wrote.
export function normalizeSql(sql, target) {
  if (target === 'bigquery') {
    return sql
      .replace(/\bCURRENT_DATE\s*\(\s*\)/gi, "CURRENT_DATE('Asia/Kolkata')")
      .replace(/\bCURRENT_DATETIME\s*\(\s*\)/gi, "CURRENT_DATETIME('Asia/Kolkata')");
  }
  if (target === 'supabase') {
    return sql.replace(/\bCURRENT_DATE\b(?!\s*\()/gi, "(NOW() AT TIME ZONE 'Asia/Kolkata')::date");
  }
  return sql;
}

// Dates a query touches: literal 'YYYY-MM-DD' strings plus DATE_SUB(CURRENT_DATE…, INTERVAL n DAY).
export function datesTouched(sql, now = nowInstant()) {
  const out = new Set();
  for (const m of sql.matchAll(/'(\d{4}-\d{2}-\d{2})'/g)) out.add(m[1]);
  const { today } = istDates(now);
  const t = new Date(today + 'T00:00:00Z');
  if (/CURRENT_DATE/i.test(sql)) out.add(today);
  for (const m of sql.matchAll(/INTERVAL\s+(\d+)\s+DAY/gi)) {
    if (/DATE_SUB\s*\(\s*CURRENT_DATE/i.test(sql)) out.add(iso(addDays(t, -Number(m[1]))));
  }
  return [...out].sort();
}
