// Fixes from the first real upload (scripts/sql/cn/007): dashes as blanks, underscores in
// names, and access rules evaluated once per query.
import { describe, it, expect, beforeEach } from "vitest";
import { engineDb } from "./pgHarness.js";
import { uploader, label } from "./uploadHelpers.js";

const LD_HEADERS = ["AWB", "Month", "Courier", "Courier Account (optional)", "Reason", "Shipment Value", "Expected CN (optional)", "CN Received Amt (optional)", "CN No. (optional)"];
const LD = { awb: "A1", month: label(2), courier: "Swift", account: "", reason: "Lost/Damage", ship: "2500", expected: "", received: "", cn: "" };

let db, ld;
beforeEach(async () => { db = await engineDb(); ld = uploader(db, "lost_damage", LD_HEADERS, LD); });

describe("a lone dash is blank", () => {
  it("lets optional amounts default and makes required ones 'required'", async () => {
    const b = await ld.upload([
      ld.row({ expected: "-", received: "–", cn: "—" }),
      ld.row({ awb: "-", ship: " - " }),
    ]);
    const rows = await ld.staged(b.id);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].parsed).toMatchObject({ expected_cn: 2500, expected_cn_defaulted: true, cn_received_amt: null, cn_number: null });
    expect(rows[1].errors).toEqual(["AWB is required", "Shipment Value is required"]);
  });

  it("still rejects a minus sign before a number", async () => {
    const b = await ld.upload([ld.row({ ship: "-5" })]);
    expect((await ld.staged(b.id))[0].errors).toEqual(["Shipment Value cannot be negative (-5)"]);
  });
});

describe("underscores in names", () => {
  it("match like spaces, for accounts, couriers and 3PL facilities", async () => {
    const b = await ld.upload([ld.row({ account: "Swift_NDD" }), ld.row({ awb: "A2", courier: "sky_air" })]);
    const rows = await ld.staged(b.id);
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toEqual(['Courier "sky_air" is not in masters — add it under Masters → Couriers first']);
    const keys = (await db.query(`SELECT name, name_key FROM cn_3pl_facilities WHERE name IN ('Hexalog_GGN2', 'Wareiq_CHN_item') ORDER BY name`)).rows;
    expect(keys).toEqual([{ name: "Hexalog_GGN2", name_key: "hexalog ggn2" }, { name: "Wareiq_CHN_item", name_key: "wareiq chn item" }]);
  });
});

describe("access rules", () => {
  it("call cn_can_upload / cn_can_manage through a sub-select (once per query, not per row)", async () => {
    const { rows } = await db.query(`SELECT tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') AS expr
      FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'cn\_%'`);
    expect(rows.length).toBeGreaterThan(20);
    const perRow = rows.filter((r) => /cn_can_(upload|manage)\(\)/.test(r.expr) && !/SELECT/.test(r.expr));
    expect(perRow).toEqual([]);
  });
});
