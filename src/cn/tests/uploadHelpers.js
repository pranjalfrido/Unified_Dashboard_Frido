// Drive an upload type through the engine the way the browser does: create the batch from a
// header row, stage rows as [rowNo, ...cells], validate, commit.
import { as, USERS } from "./pgHarness.js";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthsAgo = (n) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return d; };
// Months relative to today, so tests don't age into the >12-months warning.
export const label = (n) => { const d = monthsAgo(n); return `${MON[d.getMonth()]}-${d.getFullYear()}`; };
export const ym = (n) => { const d = monthsAgo(n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

export function uploader(db, type, headers, defaults) {
  const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];
  // row({ field: value }) -> object keyed by header, from defaults keyed by field.
  const keys = Object.keys(defaults);
  const row = (over = {}) => Object.fromEntries(headers.map((h, i) => [h, String({ ...defaults, ...over }[keys[i]] ?? "")]));

  const upload = (rows, { user = USERS.uploader, hdrs = headers } = {}) => as(db, user, async () => {
    const b = (await q1(`SELECT cn_create_batch($1, 'test.xlsx', $2) AS r`, [type, hdrs])).r;
    const payload = rows.map((v, i) => [i + 2, ...hdrs.map((h) => v[h] ?? "")]);
    await db.query(`SELECT cn_stage_rows($1, $2::jsonb)`, [b.batch_id, JSON.stringify(payload)]);
    return { id: b.batch_id, v: (await q1(`SELECT cn_validate_batch($1) AS r`, [b.batch_id])).r };
  });
  const commit = (b, user = USERS.uploader) => as(db, user, async () => (await q1(`SELECT cn_commit_batch($1, $2) AS r`, [b.id, b.v.token])).r);
  const staged = async (id) => (await db.query(
    `SELECT row_no, errors || x_errors AS errors, warnings || x_warnings AS warnings, parsed FROM cn_staging_rows WHERE batch_id = $1 ORDER BY row_no`, [id])).rows;
  return { row, upload, commit, staged, q1 };
}
