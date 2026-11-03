// Phase 1: what the schema itself guarantees, independent of the upload engine.
import { describe, it, expect, beforeEach } from "vitest";
import { freshDb, as, fails, USERS } from "./pgHarness.js";

let db;
const one = async (q, p) => (await db.query(q, p)).rows[0];

async function seed() {
  const bd = await one(`INSERT INTO cn_couriers (name) VALUES ('Bluedart') RETURNING id`);
  const dl = await one(`INSERT INTO cn_couriers (name) VALUES ('Delhivery') RETURNING id`);
  const bdAir = await one(`INSERT INTO cn_courier_accounts (courier_id, name) VALUES ($1, 'Bluedart Air') RETURNING id`, [bd.id]);
  const dlNdd = await one(`INSERT INTO cn_courier_accounts (courier_id, name) VALUES ($1, 'Delhivery NDD') RETURNING id`, [dl.id]);
  const batch = await one(`INSERT INTO cn_upload_batches (upload_type, file_name, uploaded_by) VALUES ('weight_dispute', 't.xlsx', $1) RETURNING id`, [USERS.admin]);
  return { bd: bd.id, dl: dl.id, bdAir: bdAir.id, dlNdd: dlNdd.id, batch: batch.id };
}

const wd = (s, { month = "2026-04-01", courier = s.bd, account = null, invoice = 1000, expected = 100, received = 50, active = true } = {}) =>
  db.query(
    `INSERT INTO cn_weight_dispute (month, courier_id, courier_account_id, invoice_value, expected_cn, received_cn, batch_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [month, courier, account, invoice, expected, received, s.batch, active],
  );

beforeEach(async () => { db = await freshDb(); });

describe("master names", () => {
  it("match case-insensitively, trimmed, with inner spaces collapsed", async () => {
    await db.query(`INSERT INTO cn_couriers (name) VALUES ('Delhivery')`);
    expect(await fails(db.query(`INSERT INTO cn_couriers (name) VALUES ('  delhivery ')`))).toMatch(/cn_couriers_name_key/);
    await db.query(`INSERT INTO cn_transporters (name) VALUES ('KM Logistic')`);
    expect(await fails(db.query(`INSERT INTO cn_transporters (name) VALUES ('km   LOGISTIC')`))).toMatch(/name_key/);
  });

  it("allow an account to share its courier's name, and one account name under two couriers", async () => {
    const s = await seed();
    await db.query(`INSERT INTO cn_courier_accounts (courier_id, name) VALUES ($1, 'Delhivery')`, [s.dl]);
    await db.query(`INSERT INTO cn_courier_accounts (courier_id, name) VALUES ($1, 'Surface'), ($2, 'Surface')`, [s.bd, s.dl]);
    expect(await fails(db.query(`INSERT INTO cn_courier_accounts (courier_id, name) VALUES ($1, 'bluedart AIR')`, [s.bd]))).toMatch(/cn_courier_accounts_name_key/);
  });

  it("reject blank names", async () => {
    expect(await fails(db.query(`INSERT INTO cn_couriers (name) VALUES ('   ')`))).toMatch(/check/i);
  });
});

describe("weight dispute rows", () => {
  it("cannot use an account that belongs to another courier", async () => {
    const s = await seed();
    expect(await fails(wd(s, { courier: s.bd, account: s.dlNdd }))).toMatch(/foreign key/i);
    await wd(s, { courier: s.dl, account: s.dlNdd });
  });

  it("count a blank account as a value in the active unique key", async () => {
    const s = await seed();
    await wd(s, { account: null });
    expect(await fails(wd(s, { account: null }))).toMatch(/cn_weight_dispute_active_key/);
    // blank and specific accounts for the same month + courier can coexist
    await wd(s, { account: s.bdAir });
    expect(await fails(wd(s, { account: s.bdAir }))).toMatch(/cn_weight_dispute_active_key/);
  });

  it("let archived rows sit alongside the active row with the same key", async () => {
    const s = await seed();
    await wd(s, { active: false });
    await wd(s, { active: false });
    await wd(s, { active: true });
    expect((await one(`SELECT count(*)::int n FROM cn_weight_dispute`)).n).toBe(3);
  });

  it("store month as the first of the month and refuse negative amounts", async () => {
    const s = await seed();
    expect(await fails(wd(s, { month: "2026-04-15" }))).toMatch(/check/i);
    expect(await fails(wd(s, { received: -1 }))).toMatch(/check/i);
  });

  it("keep amounts exact as NUMERIC(14,2)", async () => {
    const s = await seed();
    await wd(s, { invoice: "0.1", expected: "0.2", received: "1234.565" });
    const r = await one(`SELECT invoice_value + expected_cn AS sum, received_cn FROM cn_weight_dispute`);
    expect(r.sum).toBe("0.30");
    expect(r.received_cn).toBe("1234.57");
  });
});

describe("lost/damage rows", () => {
  const ld = (s, { awb = "AWB123", reason = "Lost/Damage", active = true } = {}) =>
    db.query(
      `INSERT INTO cn_lost_damage (awb, month, courier_id, reason, shipment_value, expected_cn, batch_id, is_active)
       VALUES ($1, '2026-04-01', $2, $3, 1500, 1500, $4, $5)`,
      [awb, s.bd, reason, s.batch, active],
    );

  it("accept only the four reasons", async () => {
    const s = await seed();
    for (const r of ["Lost/Damage", "SLA Breach", "High Ageing", "Wrong Invoicing"]) await ld(s, { reason: r });
    expect(await fails(ld(s, { awb: "AWB9", reason: "Weight Dispute" }))).toMatch(/check/i);
  });

  it("are unique on AWB + reason among active rows, and store AWB trimmed upper-case", async () => {
    const s = await seed();
    await ld(s);
    expect(await fails(ld(s))).toMatch(/cn_lost_damage_active_key/);
    await ld(s, { reason: "SLA Breach" });
    await ld(s, { active: false });
    expect(await fails(ld(s, { awb: "awb777" }))).toMatch(/check/i);
    expect(await fails(ld(s, { awb: " AWB777" }))).toMatch(/check/i);
  });
});

describe("3PL rows", () => {
  it("cannot use a facility that belongs to another partner", async () => {
    const hx = await one(`INSERT INTO cn_3pl_partners (name) VALUES ('Hexalog') RETURNING id`);
    const wq = await one(`INSERT INTO cn_3pl_partners (name) VALUES ('WareIQ') RETURNING id`);
    const f = await one(`INSERT INTO cn_3pl_facilities (partner_id, name, location) VALUES ($1, 'Wareiq_CHN', 'Chennai') RETURNING id`, [wq.id]);
    const b = await one(`INSERT INTO cn_upload_batches (upload_type, file_name, uploaded_by) VALUES ('3pl', 't.xlsx', $1) RETURNING id`, [USERS.admin]);
    const ins = (partner) => db.query(
      `INSERT INTO cn_3pl (month, partner_id, facility_id, invoice_value, expected_cn, received_cn, batch_id) VALUES ('2026-04-01', $1, $2, 1, 1, 0, $3)`,
      [partner, f.id, b.id]);
    expect(await fails(ins(hx.id))).toMatch(/foreign key/i);
    await ins(wq.id);
  });
});

describe("views", () => {
  it("show active rows only, with pending CN and recovery %", async () => {
    const s = await seed();
    await wd(s, { expected: 200, received: 50 });
    await wd(s, { account: s.bdAir, expected: 0, received: 0 });
    await wd(s, { month: "2026-03-01", active: false });
    const rows = (await db.query(`SELECT courier, courier_account, pending_cn, recovery_pct FROM cn_weight_dispute_v ORDER BY courier_account NULLS FIRST`)).rows;
    expect(rows).toEqual([
      { courier: "Bluedart", courier_account: null, pending_cn: "150.00", recovery_pct: "25.00" },
      { courier: "Bluedart", courier_account: "Bluedart Air", pending_cn: "0.00", recovery_pct: null },
    ]);
  });

  it("treat a blank lost/damage CN amount as nothing received yet", async () => {
    const s = await seed();
    await db.query(
      `INSERT INTO cn_lost_damage (awb, month, courier_id, reason, shipment_value, expected_cn, cn_received_amt, batch_id)
       VALUES ('A1', '2026-04-01', $1, 'Lost/Damage', 1500, 1200, NULL, $2), ('A2', '2026-04-01', $1, 'SLA Breach', 800, 800, 800, $2)`,
      [s.bd, s.batch]);
    const rows = (await db.query(`SELECT awb, pending_cn, recovery_pct FROM cn_lost_damage_v ORDER BY awb`)).rows;
    expect(rows).toEqual([
      { awb: "A1", pending_cn: "1200.00", recovery_pct: "0.00" },
      { awb: "A2", pending_cn: "0.00", recovery_pct: "100.00" },
    ]);
  });
});

describe("permissions", () => {
  const check = (uid) => as(db, uid, async () => one(`SELECT cn_can_upload() AS up, cn_can_manage() AS mg`));

  it("give view/upload to Documents users and manage to admins and documents:cn-manage", async () => {
    expect(await check(USERS.admin)).toEqual({ up: true, mg: true });
    expect(await check(USERS.manager)).toEqual({ up: true, mg: true });
    expect(await check(USERS.uploader)).toEqual({ up: true, mg: false });
    expect(await check(USERS.outsider)).toEqual({ up: false, mg: false });
    expect(await check(null)).toEqual({ up: false, mg: false });
  });

  it("let uploaders read masters but only managers change them", async () => {
    await db.query(`INSERT INTO cn_couriers (name) VALUES ('Bluedart')`);
    await as(db, USERS.uploader, async () => {
      expect((await db.query(`SELECT name FROM cn_couriers`)).rows).toHaveLength(1);
      expect(await fails(db.query(`INSERT INTO cn_couriers (name) VALUES ('Swift')`))).toMatch(/row-level security/);
      expect((await db.query(`UPDATE cn_couriers SET name = 'X'`)).affectedRows).toBe(0);
    });
    await as(db, USERS.manager, async () => {
      await db.query(`INSERT INTO cn_couriers (name) VALUES ('Swift')`);
      expect((await db.query(`UPDATE cn_couriers SET is_active = false WHERE name = 'Swift'`)).affectedRows).toBe(1);
    });
    await as(db, USERS.outsider, async () => {
      expect((await db.query(`SELECT name FROM cn_couriers`)).rows).toHaveLength(0);
    });
  });

  it("allow nobody to insert data rows directly — only the engine functions write them", async () => {
    const s = await seed();
    await as(db, USERS.admin, async () => {
      expect(await fails(wd(s))).toMatch(/permission denied/);
    });
  });

  it("let managers but not uploaders edit data rows", async () => {
    const s = await seed();
    await wd(s);
    await as(db, USERS.uploader, async () => {
      expect((await db.query(`UPDATE cn_weight_dispute SET received_cn = 60`)).affectedRows).toBe(0);
    });
    await as(db, USERS.manager, async () => {
      expect((await db.query(`UPDATE cn_weight_dispute SET received_cn = 60`)).affectedRows).toBe(1);
    });
    const r = await one(`SELECT received_cn, updated_by FROM cn_weight_dispute`);
    expect(r).toEqual({ received_cn: "60.00", updated_by: USERS.manager });
  });
});
