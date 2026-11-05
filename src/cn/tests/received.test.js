// The "CN Received" summary behind Cost Analytics (scripts/sql/cn/010).
import { describe, it, expect, beforeEach } from "vitest";
import { engineDb, as, fails, USERS } from "./pgHarness.js";
import { uploader, label, ym } from "./uploadHelpers.js";

let db;
beforeEach(async () => {
  db = await engineDb();
  const wd = uploader(db, "weight_dispute", ["Month", "Courier", "Courier Account (optional)", "Total Invoice Value (ex GST)", "Total Expected CN (ex GST)", "Total Received CN (ex GST)"],
    { month: label(2), courier: "Bluedart", account: "", invoice: "100000", expected: "5000", received: "2000" });
  const ld = uploader(db, "lost_damage", ["AWB", "Month", "Courier", "Courier Account (optional)", "Reason", "Shipment Value", "Expected CN (optional)", "CN Received Amt (optional)", "CN No. (optional)"],
    { awb: "A1", month: label(2), courier: "Bluedart", account: "", reason: "SLA Breach", ship: "1000", expected: "300", received: "", cn: "" });
  const ftl = uploader(db, "ftl_ptl", ["Month", "Transporter", "Invoice Value (ex GST)", "Total Expected CN (ex GST)", "Total Received CN (ex GST)"],
    { month: label(2), transporter: "Jopadevi", invoice: "500000", expected: "0", received: "7500" });
  await wd.commit(await wd.upload([wd.row(), wd.row({ courier: "Swift", received: "5000" })]));
  await ld.commit(await ld.upload([ld.row(), ld.row({ awb: "A2", received: "300", cn: "CN1" }), ld.row({ awb: "A3", reason: "Lost/Damage" })]));
  await ftl.commit(await ftl.upload([ftl.row()]));
});

const summary = (user) => as(db, user, async () => (await db.query(`SELECT cn_received_summary() AS s`)).rows[0].s);

describe("CN received summary", () => {
  it("is open to Cost Analytics users even without Documents access, and closed to others", async () => {
    expect((await summary(USERS.costViewer)).rows.length).toBeGreaterThan(0);
    expect((await summary(USERS.uploader)).rows.length).toBeGreaterThan(0);
    expect(await as(db, USERS.outsider, () => fails(db.query(`SELECT cn_received_summary()`)))).toMatch(/needs Cost Analytics or Documents access/);
  });

  it("totals each category, reason, partner and month, with no invoice for Lost/Damage", async () => {
    const { rows, updated } = await summary(USERS.costViewer);
    const m = ym(2);
    expect(rows).toEqual([
      { category: "B2C", reason: "Lost/Damage", partner: "Bluedart", month: m, n: 1, invoice: null, expected: 300, received: 0 },
      { category: "B2C", reason: "SLA Breach", partner: "Bluedart", month: m, n: 2, invoice: null, expected: 600, received: 300 },
      { category: "B2C", reason: "Weight Dispute", partner: "Bluedart", month: m, n: 1, invoice: 100000, expected: 5000, received: 2000 },
      { category: "B2C", reason: "Weight Dispute", partner: "Swift", month: m, n: 1, invoice: 100000, expected: 5000, received: 5000 },
      { category: "FTL/PTL", reason: "FTL/PTL", partner: "Jopadevi", month: m, n: 1, invoice: 500000, expected: 0, received: 7500 },
    ]);
    expect(Object.keys(updated).sort()).toEqual(["ftl_ptl", "lost_damage", "weight_dispute"]);
  });

  it("leaves out replaced and deleted rows", async () => {
    const id = (await db.query(`SELECT id FROM cn_weight_dispute WHERE is_active LIMIT 1`)).rows[0].id;
    await as(db, USERS.manager, () => db.query(`SELECT cn_delete_row('weight_dispute', $1)`, [id]));
    const wd = (await summary(USERS.costViewer)).rows.filter((r) => r.reason === "Weight Dispute");
    expect(wd).toHaveLength(1);
  });
});

describe("CN received page totals", async () => {
  const { summarize, applyFilters, pendingOf, recoveryOf, shareOfInvoice } = await import("../cnReceived.js");
  const rows = [
    { category: "B2C", reason: "Weight Dispute", partner: "Bluedart", month: "2026-08", n: 1, invoice: 100000, expected: 5000, received: 2000 },
    { category: "B2C", reason: "SLA Breach", partner: "Bluedart", month: "2026-08", n: 2, invoice: null, expected: 600, received: 300 },
    { category: "FTL/PTL", reason: "FTL/PTL", partner: "Jopadevi", month: "2026-07", n: 1, invoice: 500000, expected: 0, received: 7500 },
  ];

  it("rolls rows up by category and reason, month and partner", () => {
    const s = summarize(rows);
    expect(s.total).toMatchObject({ n: 4, invoice: 600000, expected: 5600, received: 9800 });
    const b2c = s.categories.find((c) => c.key === "B2C");
    expect(b2c.total).toMatchObject({ expected: 5600, received: 2300, invoice: 100000 });
    expect(b2c.reasons.find((r) => r.reason === "SLA Breach").total).toMatchObject({ n: 2, hasInvoice: false, expected: 600 });
    expect(s.months.map((m) => m.month)).toEqual(["2026-08", "2026-07"]);
    expect(s.partners.map((p) => [p.partner, pendingOf(p.total)])).toEqual([["Bluedart", 3300], ["Jopadevi", -7500]]);
  });

  it("works out pending, recovery and share of invoice, leaving undefined ratios blank", () => {
    const s = summarize(rows);
    expect(recoveryOf(s.total)).toBeCloseTo(9800 / 5600);
    expect(shareOfInvoice(s.total)).toBeCloseTo(9800 / 600000);
    const ftl = s.categories.find((c) => c.key === "FTL/PTL").total;
    expect(recoveryOf(ftl)).toBeNull();
    expect(shareOfInvoice(s.categories.find((c) => c.key === "B2C").reasons.find((r) => r.reason === "SLA Breach").total)).toBeNull();
  });

  it("filters by month range, category and partner", () => {
    expect(applyFilters(rows, { from: "2026-08", to: "", category: "", partner: "" })).toHaveLength(2);
    expect(applyFilters(rows, { from: "", to: "2026-07", category: "", partner: "" })).toHaveLength(1);
    expect(applyFilters(rows, { from: "", to: "", category: "FTL/PTL", partner: "" })).toHaveLength(1);
    expect(applyFilters(rows, { from: "", to: "", category: "", partner: "Bluedart" })).toHaveLength(2);
  });
});
