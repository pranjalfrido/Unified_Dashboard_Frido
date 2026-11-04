// Phase 2: the upload engine, exercised through the Weight Dispute upload.
import { describe, it, expect, beforeEach } from "vitest";
import { engineDb, as, fails, USERS } from "./pgHarness.js";

let db;
beforeEach(async () => { db = await engineDb(); });

// Months relative to today, so the tests don't age into the >12-months warning.
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthsAgo = (n) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return d; };
const label = (n) => { const d = monthsAgo(n); return `${MON[d.getMonth()]}-${d.getFullYear()}`; };
const iso = (n) => { const d = monthsAgo(n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
const ym = (n) => iso(n).slice(0, 7);

const HEADERS = ["Month", "Courier", "Courier Account (optional)", "Total Invoice Value (ex GST)", "Total Expected CN (ex GST)", "Total Received CN (ex GST)"];
const row = ({ month = label(2), courier = "Delhivery", account = "", invoice = "100000", expected = "5000", received = "2000" } = {}) =>
  Object.fromEntries(HEADERS.map((h, i) => [h, [month, courier, account, invoice, expected, received][i]]));

const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];

async function upload(rows, { headers = HEADERS, user = USERS.uploader } = {}) {
  return as(db, user, async () => {
    const b = (await q1(`SELECT cn_create_batch('weight_dispute', 'wd.xlsx', $1) AS r`, [headers])).r;
    const payload = rows.map((v, i) => [i + 2, ...headers.map((h) => v[h] ?? "")]);
    await db.query(`SELECT cn_stage_rows($1, $2::jsonb)`, [b.batch_id, JSON.stringify(payload)]);
    const v = (await q1(`SELECT cn_validate_batch($1) AS r`, [b.batch_id])).r;
    return { id: b.batch_id, v };
  });
}
const commit = (b, user = USERS.uploader) => as(db, user, async () => (await q1(`SELECT cn_commit_batch($1, $2) AS r`, [b.id, b.v.token])).r);
const rollback = (id, user = USERS.manager) => as(db, user, async () => (await q1(`SELECT cn_rollback_batch($1) AS r`, [id])).r);
const staged = async (id) => (await db.query(
  `SELECT row_no, errors || x_errors AS errors, warnings || x_warnings AS warnings FROM cn_staging_rows WHERE batch_id = $1 ORDER BY row_no`, [id])).rows;
const errorsOf = async (id) => (await staged(id)).flatMap((r) => r.errors);
const active = async () => (await db.query(
  `SELECT courier, courier_account, invoice_value, expected_cn, received_cn, pending_cn FROM cn_weight_dispute_v ORDER BY courier, courier_account NULLS FIRST`)).rows;

describe("parsing", () => {
  it("reads every accepted month format, normalised to the first of the month", async () => {
    const cases = {
      "Apr-2026": "2026-04-01", "april 2026": "2026-04-01", "Apr-26": "2026-04-01", "Sept 2026": "2026-09-01",
      "04/2026": "2026-04-01", "4-2026": "2026-04-01", "2026-04": "2026-04-01", "2026/4": "2026-04-01",
      "2026-04-15": "2026-04-01", "15/04/2026": "2026-04-01", "46113": "2026-04-01",
    };
    for (const [input, want] of Object.entries(cases)) {
      const r = await q1(`SELECT cn_parse_month($1)::text AS d`, [input]);
      expect([input, r.d]).toEqual([input, want]);
    }
    for (const bad of ["13/2026", "Apz-2026", "2026", "Marx 2026", "hello", "31/13/2026"]) {
      expect([bad, (await q1(`SELECT cn_parse_month($1) AS d`, [bad])).d]).toEqual([bad, null]);
    }
  });

  it("reads amounts with ₹, Rs, commas and spaces; brackets are negative", async () => {
    const cases = { "₹1,23,456.78": "123456.78", "Rs. 500": "500", " 1,000 ": "1000", "INR 75.5": "75.5", "(100)": "-100", "0": "0" };
    for (const [input, want] of Object.entries(cases)) {
      expect([input, (await q1(`SELECT cn_parse_amount($1)::text AS n`, [input])).n]).toEqual([input, want]);
    }
    for (const bad of ["12a", "-", "1.2.3", "abc"]) expect((await q1(`SELECT cn_parse_amount($1) AS n`, [bad])).n).toBeNull();
  });
});

describe("headers", () => {
  it("match ignoring case, spacing, punctuation, '(optional)' and known aliases", async () => {
    const headers = ["  month ", "COURIER", "Account", "Invoice Value", "Expected CN", "Received CN", "Notes"];
    const values = Object.values(row({ account: "Delhivery Surface" }));
    const b = await upload([Object.fromEntries(headers.map((h, i) => [h, values[i] ?? "ignored"]))], { headers });
    expect(await errorsOf(b.id)).toEqual([]);
    expect(b.v.rows_to_save).toBe(1);
    const batch = await q1(`SELECT header_map FROM cn_upload_batches WHERE id = $1`, [b.id]);
    expect(batch.header_map).toEqual({ month: 0, courier: 1, courier_account: 2, invoice_value: 3, expected_cn: 4, received_cn: 5 });
  });

  it("fail clearly when a required column is missing, and allow the optional one to be absent", async () => {
    const msg = await as(db, USERS.uploader, () => fails(db.query(
      `SELECT cn_create_batch('weight_dispute', 'x.xlsx', $1)`, [["Month", "Courier", "Total Invoice Value (ex GST)"]])));
    expect(msg).toMatch(/Missing required column\(s\): Total Expected CN \(ex GST\), Total Received CN \(ex GST\)/);
    const noAccount = HEADERS.filter((h) => !h.startsWith("Courier Account"));
    const b = await upload([Object.fromEntries(Object.entries(row()).filter(([k]) => noAccount.includes(k)))], { headers: noAccount });
    expect(b.v.rows_to_save).toBe(1);
  });

  it("refuse two columns that match the same field", async () => {
    const msg = await as(db, USERS.uploader, () => fails(db.query(
      `SELECT cn_create_batch('weight_dispute', 'x.xlsx', $1)`, [[...HEADERS, "Received CN"]])));
    expect(msg).toMatch(/More than one column matches: Total Received CN/);
  });
});

describe("row errors", () => {
  it("collect every error on every row, not just the first", async () => {
    const b = await upload([
      row({ courier: "", invoice: "abc", expected: "-5", month: "Apz-2026" }),
      row({ courier: "DHL" }),
      row({ courier: "Bluedart", account: "Delhivery Surface" }),
      row({ courier: "Delhivery", account: "Delhivery Mars" }),
      row({ month: label(-1) }),
      row({ received: "" }),
    ]);
    const rows = await staged(b.id);
    expect(rows[0].errors).toEqual([
      'Month "Apz-2026" is not a month — use e.g. Apr-2026, 04/2026 or 2026-04',
      "Courier is required",
      'Total Invoice Value (ex GST) "abc" is not a number',
      "Total Expected CN (ex GST) cannot be negative (-5)",
    ]);
    expect(rows[1].errors).toEqual(['Courier "DHL" is not in masters — add it under Masters → Couriers first']);
    expect(rows[2].errors).toEqual(['Courier Account "Delhivery Surface" belongs to Delhivery, not Bluedart']);
    expect(rows[3].errors).toEqual(['Courier Account "Delhivery Mars" is not in masters under Delhivery — add it under Masters → Courier accounts first']);
    expect(rows[4].errors[0]).toMatch(/is in the future — the latest allowed is/);
    expect(rows[5].errors).toEqual(["Total Received CN (ex GST) is required"]);
    expect(b.v.error_rows).toBe(6);
    expect(b.v.rows_to_save).toBe(0);
  });

  it("reject a deactivated courier", async () => {
    await db.query(`UPDATE cn_couriers SET is_active = false WHERE name = 'Swift'`);
    const b = await upload([row({ courier: "swift" })]);
    expect(await errorsOf(b.id)).toEqual(['Courier "Swift" is deactivated in masters']);
  });

  it("match master names ignoring case and extra spaces", async () => {
    const b = await upload([row({ courier: "  delhivery ", account: "DELHIVERY   surface" })]);
    expect(await errorsOf(b.id)).toEqual([]);
  });
});

describe("warnings (never block)", () => {
  it("flag received > expected, expected > invoice and months over 12 months back", async () => {
    const b = await upload([
      row({ received: "6000", expected: "5000" }),
      row({ courier: "Bluedart", invoice: "1000", expected: "5000", received: "0" }),
      row({ courier: "Swift", month: label(14) }),
    ]);
    const rows = await staged(b.id);
    expect(rows[0].warnings).toContain("Received CN (6000) is more than Expected CN (5000)");
    expect(rows[1].warnings).toContain("Expected CN (5000) is more than Invoice Value (1000)");
    expect(rows[2].warnings.join()).toMatch(/is more than 12 months ago/);
    expect(b.v.rows_to_save).toBe(3);
  });

  it("flag a courier-level row next to account rows for the same month + courier", async () => {
    const b = await upload([row({ account: "" }), row({ account: "Delhivery Surface" }), row({ courier: "Swift" })]);
    const rows = await staged(b.id);
    expect(rows[0].warnings.join()).toMatch(/courier-level row \(no account\) and account rows/);
    expect(rows[1].warnings.join()).toMatch(/courier-level row/);
    expect(rows[2].warnings).toEqual([]);
  });

  it("compare the invoice value with the bill ledger at the configured threshold", async () => {
    await db.query(`INSERT INTO logistics_invoice_totals VALUES ('B2C', 'Delhivery', $1, 'INV1', 10, 100000), ('B2C', 'Swift', $1, 'INV2', 10, 100000)`, [ym(2)]);
    const b = await upload([
      row({ courier: "Delhivery", invoice: "104000" }),        // 4% off: fine
      row({ courier: "Swift", invoice: "110000" }),            // 10% off: warn
      row({ courier: "SkyAir", invoice: "5000" }),             // nothing in the ledger
    ]);
    const w = Object.fromEntries(b.v.scopes.map((s) => [s.label.split(" / ")[1], s.warnings]));
    expect(w.Delhivery).toEqual([]);
    expect(w.Swift[0]).toMatch(/Invoice value 110000 differs from the bill ledger \(100000.*\) by 10.0% — over the 5% threshold/);
    expect(w.SkyAir[0]).toMatch(/No bill-ledger total/);
    await db.query(`UPDATE cn_settings SET value = '12' WHERE key = 'invoice_variance_pct'`);
    const b2 = await upload([row({ courier: "Swift", invoice: "110000" })]);
    expect(b2.v.scopes[0].warnings).toEqual([]);
  });
});

describe("duplicates in the file", () => {
  it("treat two blank-account rows for one month + courier as duplicates", async () => {
    const b = await upload([row(), row(), row({ account: "Delhivery Surface" }), row({ account: "delhivery surface" })]);
    const rows = await staged(b.id);
    expect(rows[1].errors).toEqual(["Duplicate of row 2 (same Month + Courier + Courier Account)"]);
    expect(rows[3].errors).toEqual(["Duplicate of row 4 (same Month + Courier + Courier Account)"]);
    expect(b.v.scopes[0].status).toBe("blocked");
  });
});

describe("scopes", () => {
  it("block the whole scope if any of its rows has an error, and let clean scopes commit", async () => {
    const b = await upload([
      row({ courier: "Delhivery", account: "Delhivery Surface" }),
      row({ courier: "Delhivery", account: "Delhivery Express", expected: "x" }),
      row({ courier: "Bluedart" }),
    ]);
    const byLabel = Object.fromEntries(b.v.scopes.map((s) => [s.label, s]));
    expect(byLabel[`${label(2)} / Delhivery`]).toMatchObject({ status: "blocked", blocked_by: [3], new_rows: 1, error_rows: 1 });
    expect(byLabel[`${label(2)} / Bluedart`]).toMatchObject({ status: "new", new_rows: 1 });
    const res = await commit(b);
    expect(res).toMatchObject({ inserted_rows: 1, replaced_rows: 0, blocked_scopes: 1, failed_rows: 2 });
    expect((await active()).map((r) => r.courier)).toEqual(["Bluedart"]);
  });

  it("block a courier's scopes for an unreadable month, but let an unknown courier block only itself", async () => {
    const b = await upload([
      row({ courier: "Delhivery", month: label(2) }),
      row({ courier: "Delhivery", month: label(3) }),
      row({ courier: "Bluedart", month: label(2) }),
      row({ courier: "Bluedart", month: label(3) }),
      row({ courier: "Delhivery", month: "??" }),   // could be either Delhivery month: blocks both
      row({ courier: "Bluedrat", month: label(3) }), // unknown courier: blocks nothing else
    ]);
    const st = Object.fromEntries(b.v.scopes.map((s) => [s.label, s.status]));
    expect(st).toEqual({
      [`${label(2)} / Delhivery`]: "blocked", [`${label(3)} / Delhivery`]: "blocked",
      [`${label(2)} / Bluedart`]: "new", [`${label(3)} / Bluedart`]: "new",
    });
    expect(b.v).toMatchObject({ error_rows: 2, rows_to_save: 2 });
  });
});

describe("replace by scope", () => {
  it("archive the scope's active rows, insert the new ones and leave other scopes alone", async () => {
    const first = await upload([
      row({ courier: "Delhivery", account: "Delhivery Surface", received: "1000" }),
      row({ courier: "Delhivery", account: "Delhivery Express", received: "1000" }),
      row({ courier: "Bluedart", received: "1000" }),
    ]);
    await commit(first);

    const second = await upload([row({ courier: "Delhivery", account: "", received: "4000" })]);
    expect(second.v.scopes).toEqual([expect.objectContaining({ label: `${label(2)} / Delhivery`, status: "replace", existing_rows: 2, new_rows: 1 })]);
    expect(second.v.rows_to_replace).toBe(2);
    expect(await commit(second)).toMatchObject({ inserted_rows: 1, replaced_rows: 2 });

    expect(await active()).toEqual([
      expect.objectContaining({ courier: "Bluedart", received_cn: "1000.00" }),
      expect.objectContaining({ courier: "Delhivery", courier_account: null, received_cn: "4000.00", pending_cn: "1000.00" }),
    ]);
    const archived = await db.query(`SELECT count(*)::int n FROM cn_weight_dispute WHERE NOT is_active AND replaced_by_batch_id = $1 AND replaced_at IS NOT NULL`, [second.id]);
    expect(archived.rows[0].n).toBe(2);
    const batch = await q1(`SELECT status, inserted_rows, replaced_rows, failed_rows, total_rows FROM cn_upload_batches WHERE id = $1`, [second.id]);
    expect(batch).toEqual({ status: "committed", inserted_rows: 1, replaced_rows: 2, failed_rows: 0, total_rows: 1 });
  });

  it("refuse to commit if the data changed after the preview", async () => {
    const a = await upload([row()]);
    const b = await upload([row({ received: "999" })]);
    await commit(a);
    const msg = await fails(commit(b));
    expect(msg).toMatch(/changed since this file was previewed/);
    const again = await as(db, USERS.uploader, async () => (await q1(`SELECT cn_validate_batch($1) AS r`, [b.id])).r);
    expect(again.scopes[0]).toMatchObject({ status: "replace", existing_rows: 1 });
    await commit({ id: b.id, v: again });
  });

  it("refuse to commit if masters changed after the preview", async () => {
    const b = await upload([row()]);
    await new Promise((r) => setTimeout(r, 5));
    await db.query(`UPDATE cn_couriers SET ledger_names = ledger_names WHERE name = 'Ekart'`);
    expect(await fails(commit(b))).toMatch(/Masters changed since this file was previewed/);
  });

  it("refuse to commit a stale preview after more rows were staged", async () => {
    const b = await upload([row()]);
    const extra = [[50, ...HEADERS.map((h) => row({ courier: "Swift" })[h])]];
    await as(db, USERS.uploader, () => db.query(`SELECT cn_stage_rows($1, $2::jsonb)`, [b.id, JSON.stringify(extra)]));
    expect(await fails(commit(b))).toMatch(/changed since it was previewed/);
  });

  it("refuse to commit a file with nothing valid", async () => {
    const b = await upload([row({ courier: "DHL" })]);
    expect(await fails(commit(b))).toMatch(/Nothing to save/);
  });
});

describe("preview details", () => {
  it("notes on clean rows why they won't be saved when their scope is blocked", async () => {
    const b = await upload([row({ account: "Delhivery Surface" }), row({ account: "Delhivery Express", invoice: "x" })]);
    const notes = (await db.query(`SELECT row_no, blocked_note FROM cn_staging_rows WHERE batch_id = $1 ORDER BY row_no`, [b.id])).rows;
    expect(notes).toEqual([
      { row_no: 2, blocked_note: `Not saved: ${label(2)} / Delhivery is blocked by errors in row 3` },
      { row_no: 3, blocked_note: null },
    ]);
    expect(b.v).toMatchObject({ error_rows: 1, failed_rows: 2, rows_to_save: 0 });
  });

  it("lists scopes inline for small files and leaves large ones to be paged", async () => {
    const couriers = ["Bluedart", "Delhivery", "Ekart", "ElasticRun", "Safexpress", "Shadowfax", "SkyAir", "Swift", "Urbanbolt"];
    const many = [];
    for (let m = 0; m < 25; m++) for (const c of couriers) many.push(row({ courier: c, month: label(m) }));
    const b = await upload(many);
    expect(b.v).toMatchObject({ total_scopes: 225, scopes: null, rows_to_save: 225 });
    const small = await upload([row()]);
    expect(small.v.scopes).toHaveLength(1);
  });

  it("names the first scopes it will replace for the confirmation", async () => {
    await commit(await upload([row({ courier: "Swift" }), row({ courier: "Bluedart" })]));
    const b = await upload([row({ courier: "Swift" }), row({ courier: "Bluedart" }), row({ courier: "SkyAir" })]);
    expect(b.v).toMatchObject({ replace_scopes: 2, new_scopes: 1, rows_to_replace: 2,
      replace_labels: [`${label(2)} / Bluedart`, `${label(2)} / Swift`] });
  });
});

describe("rollback", () => {
  it("restore what the batch replaced, and refuse while a later batch covers the same scope", async () => {
    const first = await upload([row({ received: "1000" })]);
    await commit(first);
    const second = await upload([row({ received: "2000" })]);
    await commit(second);

    expect(await fails(rollback(first.id))).toMatch(/later upload\(s\) #\d+ \(.* \/ Delhivery\) have replaced the same data/);
    expect(await rollback(second.id)).toMatchObject({ deactivated_rows: 1, restored_rows: 1 });
    expect((await active()).map((r) => r.received_cn)).toEqual(["1000.00"]);
    expect(await rollback(first.id)).toMatchObject({ deactivated_rows: 1, restored_rows: 0 });
    expect(await active()).toEqual([]);
    expect(await fails(rollback(first.id))).toMatch(/is rolled back, not committed/);
  });

  it("is only for managers", async () => {
    const b = await upload([row()]);
    await commit(b);
    expect(await fails(rollback(b.id, USERS.uploader))).toMatch(/needs Documents → Credit notes: manage/);
  });
});

describe("access", () => {
  it("keeps outsiders out and a staged batch to its uploader (and managers)", async () => {
    expect(await as(db, USERS.outsider, () => fails(db.query(`SELECT cn_create_batch('weight_dispute', 'x', $1)`, [HEADERS])))).toMatch(/don't have access/);
    const b = await upload([row()]);
    expect(await as(db, USERS.admin, async () => (await q1(`SELECT cn_validate_batch($1) AS r`, [b.id])).r.rows_to_save)).toBe(1);
    await db.query(`DELETE FROM user_profiles WHERE user_id = $1`, [USERS.admin]);
    await db.query(`INSERT INTO user_permissions (user_id, tab) VALUES ($1, 'documents')`, [USERS.admin]);
    expect(await as(db, USERS.admin, () => fails(db.query(`SELECT cn_validate_batch($1)`, [b.id])))).toMatch(/uploaded by someone else/);
    expect(await as(db, USERS.manager, async () => (await q1(`SELECT cn_validate_batch($1) AS r`, [b.id])).r.rows_to_save)).toBe(1);
  });

  it("discarding a batch drops its staged rows", async () => {
    const b = await upload([row()]);
    await as(db, USERS.uploader, () => db.query(`SELECT cn_discard_batch($1)`, [b.id]));
    expect(await q1(`SELECT status, (SELECT count(*)::int FROM cn_staging_rows WHERE batch_id = $1) AS n FROM cn_upload_batches WHERE id = $1`, [b.id]))
      .toEqual({ status: "discarded", n: 0 });
    expect(await fails(commit(b))).toMatch(/is discarded, not staged/);
  });
});

describe("background commit for large files", () => {
  const queueThreshold = (n) => db.query(`UPDATE cn_settings SET value = $1::jsonb WHERE key = 'sync_commit_max_rows'`, [String(n)]);
  const status = async (id) => q1(`SELECT status, inserted_rows, replaced_rows, commit_error, queued_at IS NOT NULL AS queued FROM cn_upload_batches WHERE id = $1`, [id]);

  it("commits in place up to the threshold", async () => {
    await queueThreshold(2);
    expect(await commit(await upload([row(), row({ courier: "Swift" })]))).toMatchObject({ queued: false, inserted_rows: 2 });
  });

  it("queues a file over the threshold and lets the worker commit it as one transaction", async () => {
    await commit(await upload([row({ received: "1" }), row({ courier: "Swift", received: "1" })]));
    await queueThreshold(3);
    const b = await upload([row({ received: "2" }), row({ courier: "Swift", received: "2" })]); // 2 saved + 2 replaced = 4
    expect(await commit(b)).toEqual({ batch_id: b.id, queued: true, rows_touched: 4 });
    expect(await status(b.id)).toMatchObject({ status: "queued", queued: true });
    expect(await fails(as(db, USERS.uploader, () => db.query(`SELECT cn_discard_batch($1)`, [b.id])))).toMatch(/is queued, not staged/);
    expect((await active()).map((r) => r.received_cn)).toEqual(["1.00", "1.00"]); // nothing changed yet

    expect((await q1(`SELECT cn_run_commit_queue() AS n`)).n).toBe(1);
    expect(await status(b.id)).toMatchObject({ status: "committed", inserted_rows: 2, replaced_rows: 2, commit_error: null });
    expect((await active()).map((r) => r.received_cn)).toEqual(["2.00", "2.00"]);
    expect((await q1(`SELECT cn_run_commit_queue() AS n`)).n).toBe(0);
  });

  it("sends a queued batch back to staged with the reason if the data changed before the worker ran", async () => {
    await queueThreshold(0);
    const a = await upload([row()]);
    const b = await upload([row({ received: "9" })]);
    expect((await commit(a)).queued).toBe(true);
    expect((await commit(b)).queued).toBe(true);
    await db.query(`SELECT cn_run_commit_queue()`); // a commits first, so b's scope changed
    expect(await status(a.id)).toMatchObject({ status: "committed" });
    expect(await status(b.id)).toMatchObject({ status: "staged", queued: false, commit_error: expect.stringMatching(/data changed since this file was previewed/) });
    // It must be previewed again before it can be saved.
    expect(await fails(commit(b))).toMatch(/changed since it was previewed/);
    const again = await as(db, USERS.uploader, async () => (await q1(`SELECT cn_validate_batch($1) AS r`, [b.id])).r);
    expect(again.scopes[0]).toMatchObject({ status: "replace", existing_rows: 1 });
  });

  it("is only callable by the database itself", async () => {
    expect(await as(db, USERS.admin, () => fails(db.query(`SELECT cn_run_commit_queue()`)))).toMatch(/permission denied/);
  });
});
