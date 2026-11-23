// Phase 3: FTL/PTL (Month + Transporter) and 3PL (Month + Partner + Facility) uploads.
import { describe, it, expect, beforeEach } from "vitest";
import { engineDb } from "./pgHarness.js";
import { uploader, label, ym } from "./uploadHelpers.js";

let db;
beforeEach(async () => { db = await engineDb(); });

describe("FTL/PTL", () => {
  const HEADERS = ["Month", "Transporter", "Invoice Value (ex GST)", "Total Expected CN (ex GST)", "Total Received CN (ex GST)"];
  const DEFAULTS = { month: label(2), transporter: "Jopadevi", invoice: "850000", expected: "25000", received: "10000" };
  const t = () => uploader(db, "ftl_ptl", HEADERS, DEFAULTS);

  it("saves a valid file and replaces by Month + Transporter", async () => {
    const u = t();
    await u.commit(await u.upload([u.row(), u.row({ transporter: "KM Logistic" })]));
    const b = await u.upload([u.row({ received: "25000" })]);
    expect(b.v.scopes).toEqual([expect.objectContaining({ label: `${label(2)} / Jopadevi`, status: "replace", existing_rows: 1, new_rows: 1 })]);
    await u.commit(b);
    const rows = (await db.query(`SELECT transporter, received_cn, pending_cn, recovery_pct FROM cn_ftl_ptl_v ORDER BY transporter`)).rows;
    expect(rows).toEqual([
      { transporter: "Jopadevi", received_cn: "25000.00", pending_cn: "0.00", recovery_pct: "100.00" },
      { transporter: "KM Logistic", received_cn: "10000.00", pending_cn: "15000.00", recovery_pct: "40.00" },
    ]);
  });

  it("rejects unknown or deactivated transporters and in-file duplicates; warns on amounts", async () => {
    await db.query(`UPDATE cn_transporters SET is_active = false WHERE name = 'Reliable'`);
    const u = t();
    const b = await u.upload([
      u.row({ transporter: "KM-Logistics" }), u.row({ transporter: "reliable" }),
      u.row(), u.row({ invoice: "1" }), u.row({ transporter: "VS Transport", received: "30000" }),
    ]);
    const rows = await u.staged(b.id);
    expect(rows[0].errors).toEqual(['Transporter "KM-Logistics" is not in masters — add it under Masters → Transporters first']);
    expect(rows[1].errors).toEqual(['Transporter "Reliable" is deactivated in masters']);
    expect(rows[3].errors).toEqual(["Duplicate of row 4 (same Month + Transporter)"]);
    expect(rows[4].warnings).toEqual(["Received CN (30000) is more than Expected CN (25000)"]);
  });

  it("checks the invoice value against the FTL/PTL ledger, using every ledger name of the transporter", async () => {
    // KM Logistic stands for "KM-Logistic" (freight) and "KM Logistic" (vehicle rentals).
    await db.query(`INSERT INTO logistics_invoice_totals VALUES ('FTL/PTL', 'KM-Logistic', $1, 'I1', 3, 60000), ('FTL/PTL', 'KM Logistic', $1, '', 1, 40000)`, [ym(2)]);
    const u = t();
    const ok = await u.upload([u.row({ transporter: "KM Logistic", invoice: "102000" })]);
    expect(ok.v.scopes[0].warnings).toEqual([]);
    const off = await u.upload([u.row({ transporter: "KM Logistic", invoice: "80000" })]);
    expect(off.v.scopes[0].warnings[0]).toMatch(/differs from the bill ledger \(100000.*\) by 20.0%/);
  });
});

describe("3PL", () => {
  const HEADERS = ["Month", "3PL Partner", "3PL Facility", "Location", "Invoice Value (ex GST)", "Total Expected CN (ex GST)", "Total Received CN (ex GST)"];
  const DEFAULTS = { month: label(2), partner: "Hexalog", facility: "Hexalog_GGN2", location: "Gurgaon", invoice: "460500", expected: "18000", received: "0" };
  const t = () => uploader(db, "3pl", HEADERS, DEFAULTS);

  it("saves facilities under their partner and replaces by Month + 3PL Partner", async () => {
    const u = t();
    await u.commit(await u.upload([u.row(), u.row({ facility: "Gurgaon_Hexalog" }), u.row({ partner: "WareIQ", facility: "Wareiq_CHN_item", location: "chennai" })]));
    const b = await u.upload([u.row({ received: "18000" })]);
    expect(b.v.scopes).toEqual([expect.objectContaining({ label: `${label(2)} / Hexalog`, status: "replace", existing_rows: 2, new_rows: 1 })]);
    await u.commit(b);
    const rows = (await db.query(`SELECT partner, facility, location, recovery_pct FROM cn_3pl_v ORDER BY partner, facility`)).rows;
    expect(rows).toEqual([
      { partner: "Hexalog", facility: "Hexalog_GGN2", location: "Gurgaon", recovery_pct: "100.00" },
      { partner: "WareIQ", facility: "Wareiq_CHN_item", location: "Chennai", recovery_pct: "0.00" },
    ]);
  });

  it("rejects a facility under the wrong partner, an unknown facility and a wrong location", async () => {
    const u = t();
    const b = await u.upload([
      u.row({ partner: "WareIQ", facility: "Hexalog_GGN2", location: "Gurgaon" }),
      u.row({ facility: "Hexalog_Pune" }),
      u.row({ location: "Harayana" }),
      u.row({ partner: "Shiprocket" }),
    ]);
    const rows = await u.staged(b.id);
    expect(rows[0].errors).toEqual(['3PL Facility "Hexalog_GGN2" belongs to Hexalog, not WareIQ']);
    expect(rows[1].errors).toEqual(['3PL Facility "Hexalog_Pune" is not in masters under Hexalog — add it under Masters → 3PL facilities first']);
    expect(rows[2].errors).toEqual(['Location "Harayana" doesn\'t match Hexalog_GGN2\'s location in masters (Gurgaon)']);
    expect(rows[3].errors).toEqual(['3PL Partner "Shiprocket" is not in masters — add it under Masters → 3PL partners first']);
  });

  it("treats the same Month + Partner + Facility twice as a duplicate", async () => {
    const u = t();
    const b = await u.upload([u.row(), u.row({ facility: "hexalog_ggn2" })]);
    expect((await u.staged(b.id))[1].errors).toEqual(["Duplicate of row 2 (same Month + 3PL Partner + 3PL Facility)"]);
  });

  it("compares the partner's total invoice value across facilities with the 3PL ledger", async () => {
    await db.query(`INSERT INTO logistics_invoice_totals VALUES ('3PL', 'Hexalog', $1, 'H1', 1, 500000)`, [ym(2)]);
    const u = t();
    const b = await u.upload([u.row({ invoice: "300000" }), u.row({ facility: "Gurgaon_Hexalog", invoice: "200000" })]);
    expect(b.v.scopes[0]).toMatchObject({ label: `${label(2)} / Hexalog`, warnings: [] });
  });
});
