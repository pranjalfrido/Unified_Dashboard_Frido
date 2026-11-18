// The CN Received page's number formatting and totals (src/cn/format.js, src/cn/cnReceived.js).
import { describe, it, expect } from "vitest";
import { formatInr, formatInrFull, formatPct, receivedShareOfInvoice } from "../format.js";
import { summarize, inMonths, hasActivity, categoryLabel, reasonLabel, lastMonths, shareOf, buildExport, SHIPMENT_VALUE_REASONS, topPartner, topReason, categoryReasons } from "../cnReceived.js";
import * as XLSX from "xlsx";

describe("formatInr (compact)", () => {
  it("uses Cr, L and K with two decimals, and plain rupees below a thousand", () => {
    expect(formatInr(26085881)).toBe("₹2.61 Cr");
    expect(formatInr(10000000)).toBe("₹1.00 Cr");
    expect(formatInr(2944125)).toBe("₹29.44 L");
    expect(formatInr(100000)).toBe("₹1.00 L");
    expect(formatInr(7500)).toBe("₹7.50 K");
    expect(formatInr(999)).toBe("₹999");
    expect(formatInr(25.32)).toBe("₹25");
  });

  it("shows ₹0 for a real zero and — for missing, negative or non-numeric values", () => {
    expect(formatInr(0)).toBe("₹0");
    expect(formatInr("0")).toBe("₹0");
    for (const v of [null, undefined, "", NaN, Infinity, -5, "abc"]) expect([v, formatInr(v)]).toEqual([v, "—"]);
  });
});

describe("formatInrFull (exact, for tooltips)", () => {
  it("uses Indian digit grouping", () => {
    expect(formatInrFull(26085881)).toBe("₹2,60,85,881");
    expect(formatInrFull(1234567.5)).toBe("₹12,34,568");
    expect(formatInrFull(26085881.46)).toBe("₹2,60,85,881");
    expect(formatInrFull(0)).toBe("₹0");
    expect(formatInrFull(null)).toBe("—");
    expect(formatInrFull(-1)).toBe("—");
  });
});

describe("received % of invoice", () => {
  it("divides received by invoice value", () => {
    expect(receivedShareOfInvoice(26085881, 351371959)).toBeCloseTo(0.07424, 4);
    expect(formatPct(receivedShareOfInvoice(26085881, 351371959))).toBe("7.4%");
    expect(formatPct(receivedShareOfInvoice(0, 1000))).toBe("0.0%");
  });

  it("uses two decimals below 0.1%, and never rounds a real CN down to zero", () => {
    expect(formatPct(0.001)).toBe("0.1%");
    expect(formatPct(0.00099)).toBe("0.10%");
    expect(formatPct(0.0002)).toBe("0.02%");
    expect(formatPct(receivedShareOfInvoice(7500, 500000000))).toBe("<0.01%");
    expect(formatPct(-0.01)).toBe("—");
  });

  it("is blank, never Infinity or NaN, when the invoice value is 0 or missing", () => {
    for (const inv of [0, null, undefined, NaN, -10]) {
      expect(receivedShareOfInvoice(7500, inv)).toBeNull();
      expect(formatPct(receivedShareOfInvoice(7500, inv))).toBe("—");
    }
    expect(formatPct(null)).toBe("—");
    expect(formatPct(NaN)).toBe("—");
  });
});

describe("page totals", () => {
  const rows = [
    { category: "B2C", reason: "Weight Dispute", partner: "Bluedart", month: "2026-08", n: 1, invoice: 100000, expected: 5000, received: 2000 },
    { category: "B2C", reason: "SLA Breach", partner: "Bluedart", month: "2026-08", n: 2, invoice: null, expected: 600, received: 300 },
    { category: "FTL/PTL", reason: "FTL/PTL", partner: "Jopadevi", month: "2026-07", n: 1, invoice: 500000, expected: 0, received: 7500 },
    { category: "FTL/PTL", reason: "FTL/PTL", partner: "KM Logistic", month: "2026-06", n: 1, invoice: 0, expected: 0, received: 0 },
  ];

  it("rolls up by category and reason, month (oldest first) and partner, keeping Expected for the export", () => {
    const s = summarize(rows);
    expect(s.total).toMatchObject({ n: 5, invoice: 600000, expected: 5600, received: 9800 });
    const b2c = s.categories.find((c) => c.key === "B2C");
    expect(b2c.total).toMatchObject({ invoice: 100000, received: 2300 });
    expect(b2c.reasons.find((r) => r.reason === "SLA Breach").total).toMatchObject({ n: 2, invoice: null, received: 300 });
    expect(s.months.map((m) => m.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
    // Highest received first, the "Top partners" order.
    expect(s.partners.map((p) => p.partner)).toEqual(["Jopadevi", "Bluedart", "KM Logistic"]);
  });

  it("leaves the invoice value missing where only shipment-value reasons contributed", () => {
    const sla = summarize(rows.filter((r) => r.reason === "SLA Breach"));
    expect(sla.total.invoice).toBeNull();
    expect(receivedShareOfInvoice(sla.total.received, sla.total.invoice)).toBeNull();
  });

  it("flags partners and months with neither invoice value nor received CN", () => {
    const s = summarize(rows);
    expect(s.partners.filter((p) => !hasActivity(p.total)).map((p) => p.partner)).toEqual(["KM Logistic"]);
    expect(s.months.filter((m) => !hasActivity(m.total)).map((m) => m.month)).toEqual(["2026-06"]);
  });

  it("filters by the selected months; an empty list means all", () => {
    expect(inMonths(rows, ["2026-08"])).toHaveLength(2);
    expect(inMonths(rows, ["2026-06", "2026-07"])).toHaveLength(2);
    expect(inMonths(rows, [])).toHaveLength(4);
    expect(inMonths(rows, null)).toHaveLength(4);
    expect(categoryLabel("B2C")).toBe("B2C couriers");
  });
});

describe("per-format aggregation", () => {
  const rows = [
    { category: "B2C", reason: "Weight Dispute", partner: "Bluedart", month: "2026-08", n: 3, invoice: 100000, expected: 5000, received: 2000 },
    { category: "B2C", reason: "SLA Breach", partner: "Bluedart", month: "2026-08", n: 2, invoice: null, expected: 600, received: 3000 },
    { category: "B2C", reason: "Weight Dispute", partner: "Swift", month: "2026-07", n: 1, invoice: 40000, expected: 900, received: 900 },
    { category: "FTL/PTL", reason: "FTL/PTL", partner: "Jopadevi", month: "2026-08", n: 1, invoice: 500000, expected: 0, received: 7500 },
    { category: "FTL/PTL", reason: "FTL/PTL", partner: "KM Logistic", month: "2026-07", n: 1, invoice: 20000, expected: 0, received: 0 },
  ];
  const s = summarize(rows);
  const cat = (k) => s.categories.find((c) => c.key === k);

  it("totals each format, and the formats add up to the all-formats total", () => {
    expect(cat("B2C").total).toMatchObject({ n: 6, invoice: 140000, received: 5900 });
    expect(cat("FTL/PTL").total).toMatchObject({ n: 2, invoice: 520000, received: 7500 });
    expect(cat("3PL").total).toMatchObject({ n: 0, invoice: null, received: 0 });
    const sum = (k) => s.categories.reduce((a, c) => a + (c.total[k] ?? 0), 0);
    expect(sum("received")).toBe(s.total.received);
    expect(sum("invoice")).toBe(s.total.invoice);
    expect(shareOf(cat("3PL").total)).toBeNull();
  });

  it("splits every month by format, summing to the month total", () => {
    const aug = s.months.find((m) => m.month === "2026-08");
    expect(aug.byCat.B2C.received).toBe(5000);
    expect(aug.byCat["FTL/PTL"].received).toBe(7500);
    expect(aug.byCat["3PL"]).toMatchObject({ n: 0, received: 0 });
    for (const m of s.months) expect(Object.values(m.byCat).reduce((a, t) => a + t.received, 0)).toBe(m.total.received);
  });

  it("combines reasons across formats, highest received first, keeping the split by format", () => {
    expect(s.reasons.map((r) => r.reason)).toEqual(["Wrong Billing", "SLA Breach", "Weight Dispute"]);
    const wd = s.reasons.find((r) => r.reason === "Weight Dispute");
    expect(wd.total.received).toBe(2900);
    expect(wd.byCat.B2C.received).toBe(2900);
  });

  it("finds each format's top partner and top reason", () => {
    expect(topPartner(s, "B2C").partner).toBe("Bluedart");
    expect(topPartner(s, "FTL/PTL").partner).toBe("Jopadevi");
    expect(topPartner(s, "3PL")).toBeNull();
    expect(topReason(categoryReasons(cat("B2C")))).toBe("SLA Breach");
    // FTL/PTL and 3PL CNs have no reason of their own: they count as wrong billing.
    expect(topReason(categoryReasons(cat("FTL/PTL")))).toBe("Wrong Billing");
    expect(reasonLabel("Wrong Billing")).toBe("Wrong billing");
    const bluedart = s.partners.find((p) => p.partner === "Bluedart");
    expect(topReason(bluedart.reasons)).toBe("SLA Breach");
    expect(bluedart.reasons["Weight Dispute"].received).toBe(2000);
  });
});

describe("page helpers", () => {
  it("defaults to the last 12 months that have data", () => {
    const months = ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
    expect(lastMonths([...months].reverse())).toEqual(months.slice(2));
    expect(lastMonths(["2026-01", "2026-02"])).toEqual(["2026-01", "2026-02"]);
  });

  it("shows reasons in sentence case and knows which are claimed against shipment value", () => {
    expect(["Weight Dispute", "SLA Breach", "High Ageing", "Wrong Invoicing", "Lost/Damage"].map(reasonLabel))
      .toEqual(["Weight dispute", "SLA breach", "High ageing", "Wrong invoicing", "Lost/Damage"]);
    expect(SHIPMENT_VALUE_REASONS.has("Weight Dispute")).toBe(false);
    expect(SHIPMENT_VALUE_REASONS.has("SLA Breach")).toBe(true);
  });

  it("works out % of invoice on a total, blank without an invoice", () => {
    expect(shareOf({ received: 2000, invoice: 100000 })).toBeCloseTo(0.02);
    expect(shareOf({ received: 300, invoice: null })).toBeNull();
    expect(shareOf({ received: 300, invoice: 0 })).toBeNull();
  });

  it("exports Expected CN to Excel even though the page does not show it", () => {
    const wb = buildExport(summarize([{ category: "B2C", reason: "Weight Dispute", partner: "Bluedart", month: "2026-08", n: 1, invoice: 100000, expected: 5000, received: 2000 }]));
    expect(wb.SheetNames).toEqual(["By category", "By month", "By partner"]);
    const head = XLSX.utils.sheet_to_json(wb.Sheets["By month"], { header: 1 })[0];
    expect(head).toEqual(["Month", "Invoice value", "Expected CN", "Received CN", "Received % of invoice"]);
  });
});
