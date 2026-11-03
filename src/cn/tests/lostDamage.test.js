// Phase 3: Lost/Damage/SLA Breach uploads (one row per AWB + reason, replaced by Month + Courier).
import { describe, it, expect, beforeEach } from "vitest";
import { engineDb, fails } from "./pgHarness.js";
import { uploader, label } from "./uploadHelpers.js";

const HEADERS = ["AWB", "Month", "Courier", "Courier Account (optional)", "Reason", "Shipment Value",
  "Expected CN (optional)", "CN Received Amt (optional)", "CN No. (optional)"];
const DEFAULTS = { awb: "AWB1001", month: label(2), courier: "Bluedart", account: "", reason: "Lost/Damage",
  ship: "2500", expected: "", received: "", cn: "" };

let db, t;
beforeEach(async () => { db = await engineDb(); t = uploader(db, "lost_damage", HEADERS, DEFAULTS); });
const active = async () => (await db.query(
  `SELECT awb, courier, reason, shipment_value, expected_cn, expected_cn_defaulted, cn_received_amt, cn_number, pending_cn, recovery_pct
     FROM cn_lost_damage_v ORDER BY awb, reason`)).rows;

describe("valid rows", () => {
  it("default Expected CN to the Shipment Value, keep a lower one, and allow a pending CN", async () => {
    const b = await t.upload([
      t.row({ awb: " awb 1001 " }),
      t.row({ awb: "AWB1002", reason: "sla breach", expected: "1000", received: "1000", cn: "CN-77" }),
    ]);
    expect(b.v).toMatchObject({ rows_to_save: 2, error_rows: 0, warning_rows: 0 });
    await t.commit(b);
    expect(await active()).toEqual([
      expect.objectContaining({ awb: "AWB1001", reason: "Lost/Damage", expected_cn: "2500.00", expected_cn_defaulted: true,
        cn_received_amt: null, cn_number: null, pending_cn: "2500.00", recovery_pct: "0.00" }),
      expect.objectContaining({ awb: "AWB1002", reason: "SLA Breach", expected_cn: "1000.00", expected_cn_defaulted: false,
        cn_received_amt: "1000.00", cn_number: "CN-77", pending_cn: "0.00", recovery_pct: "100.00" }),
    ]);
  });
});

describe("errors", () => {
  it("cover each field, with one message per problem", async () => {
    const b = await t.upload([
      t.row({ awb: "", reason: "Lost" }),
      t.row({ awb: "A2", ship: "-1", received: "abc" }),
      t.row({ awb: "A3", courier: "Delhivery", account: "Bluedart Air" }),
      t.row({ awb: "A4", month: label(-1) }),
    ]);
    const rows = await t.staged(b.id);
    expect(rows[0].errors).toEqual(["AWB is required", 'Reason "Lost" is not one of: Lost/Damage, SLA Breach, High Ageing, Wrong Invoicing']);
    expect(rows[1].errors).toEqual(["Shipment Value cannot be negative (-1)", 'CN Received Amt "abc" is not a number']);
    expect(rows[2].errors).toEqual(['Courier Account "Bluedart Air" belongs to Bluedart, not Delhivery']);
    expect(rows[3].errors[0]).toMatch(/Month .* is in the future/);
  });

  it("treat the same AWB + reason twice in a file as a duplicate, but allow one AWB under two reasons", async () => {
    const b = await t.upload([t.row(), t.row({ awb: "awb1001" }), t.row({ reason: "High Ageing" })]);
    const rows = await t.staged(b.id);
    expect(rows.map((r) => r.errors)).toEqual([[], ["Duplicate of row 2 (same AWB + Reason)"], []]);
  });

  it("refuse an AWB + reason that is already saved under a month/courier this file doesn't cover", async () => {
    await t.commit(await t.upload([t.row({ month: label(3) })]));
    const b = await t.upload([t.row({ month: label(2) })]);
    expect((await t.staged(b.id))[0].errors).toEqual([`AWB AWB1001 (Lost/Damage) is already saved under ${label(3)} / Bluedart — only a file for that month and courier can replace it`]);
    // …but the same AWB can move when the file also covers its old scope.
    const both = await t.upload([t.row({ month: label(2) }), t.row({ awb: "AWB2000", month: label(3) })]);
    expect(both.v).toMatchObject({ error_rows: 0, rows_to_save: 2, rows_to_replace: 1 });
    await t.commit(both);
    expect((await active()).map((r) => r.awb)).toEqual(["AWB1001", "AWB2000"]);
  });
});

describe("warnings", () => {
  it("flag Expected > Shipment, CN Received > Shipment or > Expected, and CN No./amount mismatches", async () => {
    const b = await t.upload([
      t.row({ awb: "W1", expected: "3000" }),
      t.row({ awb: "W2", received: "2600", cn: "CN1" }),
      t.row({ awb: "W3", expected: "1000", received: "1200", cn: "CN2" }),
      t.row({ awb: "W4", cn: "CN3" }),
      t.row({ awb: "W5", received: "100" }),
    ]);
    const w = (await t.staged(b.id)).map((r) => r.warnings);
    expect(w[0]).toEqual(["Expected CN (3000) is more than Shipment Value (2500)"]);
    expect(w[1]).toEqual(["CN Received Amt (2600) is more than Shipment Value (2500)"]);
    expect(w[2]).toEqual(["CN Received Amt (1200) is more than Expected CN (1000)"]);
    expect(w[3]).toEqual(["CN No. is given but CN Received Amt is blank"]);
    expect(w[4]).toEqual(["CN Received Amt is given without a CN No."]);
    expect(b.v).toMatchObject({ rows_to_save: 5, error_rows: 0 });
  });
});

describe("replace by Month + Courier", () => {
  it("replaces every AWB of the scope and leaves other couriers alone", async () => {
    await t.commit(await t.upload([t.row({ awb: "A1" }), t.row({ awb: "A2" }), t.row({ awb: "D1", courier: "Delhivery" })]));
    const b = await t.upload([t.row({ awb: "A3" })]);
    expect(b.v.scopes).toEqual([expect.objectContaining({ label: `${label(2)} / Bluedart`, status: "replace", existing_rows: 2, new_rows: 1 })]);
    await t.commit(b);
    expect((await active()).map((r) => r.awb)).toEqual(["A3", "D1"]);
  });

  it("has no bill-ledger check (no invoice value)", async () => {
    const b = await t.upload([t.row()]);
    expect(b.v.scopes[0].warnings).toEqual([]);
  });

  it("puts a drop-down-able enum in the config", async () => {
    const cfg = await t.q1(`SELECT columns FROM cn_upload_types WHERE code = 'lost_damage'`);
    expect(cfg.columns.find((c) => c.key === "reason").enum).toEqual(["Lost/Damage", "SLA Breach", "High Ageing", "Wrong Invoicing"]);
  });

  it("refuses a bad header set clearly", async () => {
    const msg = await fails(t.upload([t.row()], { hdrs: ["AWB", "Month", "Courier"] }));
    expect(msg).toMatch(/Missing required column\(s\): Reason, Shipment Value/);
  });
});
