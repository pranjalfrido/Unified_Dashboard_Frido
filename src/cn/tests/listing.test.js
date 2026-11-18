// Phase 4: row edits and deletes (managers only, values only), upload history, housekeeping.
import { describe, it, expect, beforeEach } from "vitest";
import { engineDb, as, fails, USERS } from "./pgHarness.js";
import { uploader, label } from "./uploadHelpers.js";

const WD_HEADERS = ["Month", "Courier", "Courier Account (optional)", "Total Invoice Value (ex GST)", "Total Expected CN (ex GST)", "Total Received CN (ex GST)"];
const WD = { month: label(2), courier: "Delhivery", account: "", invoice: "100000", expected: "5000", received: "2000" };
const LD_HEADERS = ["AWB", "Month", "Courier", "Courier Account (optional)", "Reason", "Shipment Value", "Expected CN (optional)", "CN Received Amt (optional)", "CN No. (optional)"];
const LD = { awb: "A1", month: label(2), courier: "Bluedart", account: "", reason: "Lost/Damage", ship: "2500", expected: "1000", received: "", cn: "" };

let db, wd, ld;
beforeEach(async () => {
  db = await engineDb();
  wd = uploader(db, "weight_dispute", WD_HEADERS, WD);
  ld = uploader(db, "lost_damage", LD_HEADERS, LD);
});
const wdId = async () => (await db.query(`SELECT id FROM cn_weight_dispute_v`)).rows[0].id;
const update = (user, type, id, changes) => as(db, user, () => db.query(`SELECT cn_update_row($1, $2, $3::jsonb)`, [type, id, JSON.stringify(changes)]));
const del = (user, type, id) => as(db, user, () => db.query(`SELECT cn_delete_row($1, $2)`, [type, id]));

describe("editing a row", () => {
  it("lets a manager change values, parsed like uploads, and records who did it", async () => {
    await wd.commit(await wd.upload([wd.row()]));
    const id = await wdId();
    await update(USERS.manager, "weight_dispute", id, { received_cn: "₹4,500", expected_cn: "5500" });
    const r = (await db.query(`SELECT received_cn, expected_cn, pending_cn, recovery_pct, updated_by FROM cn_weight_dispute_v`)).rows[0];
    expect(r).toEqual({ received_cn: "4500.00", expected_cn: "5500.00", pending_cn: "1000.00", recovery_pct: "81.82", updated_by: USERS.manager });
  });

  it("refuses uploaders, key columns, bad numbers, negatives and blanking a required amount", async () => {
    await wd.commit(await wd.upload([wd.row()]));
    const id = await wdId();
    expect(await fails(update(USERS.uploader, "weight_dispute", id, { received_cn: "1" }))).toMatch(/needs Documents → Credit notes: manage/);
    expect(await fails(update(USERS.manager, "weight_dispute", id, { courier_id: 3 }))).toMatch(/courier_id can't be edited here/);
    expect(await fails(update(USERS.manager, "weight_dispute", id, { received_cn: "12a" }))).toMatch(/"12a" is not a number/);
    expect(await fails(update(USERS.manager, "weight_dispute", id, { received_cn: "-1" }))).toMatch(/cannot be negative/);
    expect(await fails(update(USERS.manager, "weight_dispute", id, { expected_cn: "" }))).toMatch(/is required/);
  });

  it("can no longer change data rows with a plain UPDATE", async () => {
    await wd.commit(await wd.upload([wd.row()]));
    expect(await as(db, USERS.manager, () => fails(db.query(`UPDATE cn_weight_dispute SET received_cn = 1`)))).toMatch(/permission denied/);
  });

  it("treats a blank Lost/Damage Expected CN as the full shipment value, and lets CN fields be filled in", async () => {
    await ld.commit(await ld.upload([ld.row()]));
    const id = (await db.query(`SELECT id FROM cn_lost_damage_v`)).rows[0].id;
    await update(USERS.manager, "lost_damage", id, { expected_cn: "", cn_received_amt: "2500", cn_number: "CN-9" });
    const r = (await db.query(`SELECT expected_cn, expected_cn_defaulted, cn_received_amt, cn_number, pending_cn FROM cn_lost_damage_v`)).rows[0];
    expect(r).toEqual({ expected_cn: "2500.00", expected_cn_defaulted: true, cn_received_amt: "2500.00", cn_number: "CN-9", pending_cn: "0.00" });
    await update(USERS.manager, "lost_damage", id, { cn_number: "" });
    expect((await db.query(`SELECT cn_number FROM cn_lost_damage_v`)).rows[0].cn_number).toBeNull();
  });

  it("refuses to edit a row that a later upload replaced", async () => {
    await wd.commit(await wd.upload([wd.row()]));
    const id = await wdId();
    await wd.commit(await wd.upload([wd.row({ received: "3000" })]));
    expect(await fails(update(USERS.manager, "weight_dispute", id, { received_cn: "1" }))).toMatch(/is not an active Weight Dispute CN row/);
  });
});

describe("deleting a row", () => {
  it("soft-deletes for managers only, frees the key, and is never undone by a rollback", async () => {
    const first = await wd.upload([wd.row()]);
    await wd.commit(first);
    const second = await wd.upload([wd.row({ received: "3000" })]);
    await wd.commit(second);
    const id = await wdId();
    expect(await fails(del(USERS.uploader, "weight_dispute", id))).toMatch(/needs Documents → Credit notes: manage/);
    await del(USERS.manager, "weight_dispute", id);
    expect((await db.query(`SELECT count(*)::int n FROM cn_weight_dispute_v`)).rows[0].n).toBe(0);
    expect((await db.query(`SELECT deleted_by, is_active FROM cn_weight_dispute WHERE id = $1`, [id])).rows[0]).toEqual({ deleted_by: USERS.manager, is_active: false });
    expect(await fails(del(USERS.manager, "weight_dispute", id))).toMatch(/not an active/);
    // Rolling back the second batch restores the first batch's row, not the deleted one.
    await as(db, USERS.manager, () => db.query(`SELECT cn_rollback_batch($1)`, [second.id]));
    expect((await db.query(`SELECT received_cn FROM cn_weight_dispute_v`)).rows).toEqual([{ received_cn: "2000.00" }]);
  });
});

describe("upload history", () => {
  const list = (user, args = [null, null, 50, 0]) => as(db, user, async () => (await db.query(`SELECT * FROM cn_list_batches($1, $2, $3, $4)`, args)).rows);

  it("lists batches newest first with the uploader's name, filterable and paged", async () => {
    await wd.commit(await wd.upload([wd.row()]));
    await ld.upload([ld.row()]);
    await wd.commit(await wd.upload([wd.row()], { user: USERS.manager }), USERS.manager);
    const all = await list(USERS.uploader);
    expect(all.map((b) => [b.type_label, b.status, b.uploaded_by_name, Number(b.total)])).toEqual([
      ["Weight Dispute CN", "committed", "Mona Manager", 3],
      ["Lost/Damage/SLA Breach CN", "staged", "uploader@test", 3],
      ["Weight Dispute CN", "committed", "uploader@test", 3],
    ]);
    expect((await list(USERS.uploader, ["weight_dispute", "committed", 1, 1])).map((b) => [b.uploaded_by_name, Number(b.total)]))
      .toEqual([["uploader@test", 2]]);
    expect(await as(db, USERS.outsider, () => fails(db.query(`SELECT * FROM cn_list_batches()`)))).toMatch(/don't have access/);
  });
});

describe("housekeeping", () => {
  it("discards previews left unsaved for more than 7 days, keeping the batch record", async () => {
    const old = await wd.upload([wd.row()]);
    const fresh = await wd.upload([wd.row({ courier: "Swift" })]);
    await db.query(`UPDATE cn_upload_batches SET uploaded_at = now() - interval '8 days' WHERE id = $1`, [old.id]);
    expect((await db.query(`SELECT cn_discard_stale_batches() AS n`)).rows[0].n).toBe(1);
    const st = (await db.query(`SELECT id, status, (SELECT count(*)::int FROM cn_staging_rows s WHERE s.batch_id = b.id) AS rows FROM cn_upload_batches b ORDER BY id`)).rows;
    expect(st).toEqual([{ id: old.id, status: "discarded", rows: 0 }, { id: fresh.id, status: "staged", rows: 1 }]);
  });
});
