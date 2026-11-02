import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from "react";
import * as XLSX from "xlsx";
import * as XLSXStyle from "xlsx-js-style";
import { Plus, Trash2, Download, Search, FileSpreadsheet, Upload, Truck, Package, Warehouse, RefreshCw, Save, AlertCircle, ArrowLeft, Receipt } from "lucide-react";
import { supabase } from "./supabase.js";
import { C as BASE_C } from "./utils.js";

// ── CREDIT NOTES ─────────────────────────────────────────────────────────────

// Category and reason are fixed lists, not free text: the summary groups on them, so a
// "Weight dispute" / "weight-dispute" spelling split would show as two rows.
const CN_CATEGORIES = ["B2C", "FTL/PTL", "3PL"];
const CN_CATEGORY_LABEL = { B2C: "B2C Couriers", "FTL/PTL": "FTL/PTL", "3PL": "3PL" };
// B2C reasons are the ones on finance's CN sheet. That sheet had none yet for FTL/PTL and
// 3PL, so theirs are a starting list to be confirmed.
const CN_REASONS = {
  B2C: ["Weight Dispute", "Lost/Damage", "SLA Breach", "High Ageing", "Wrong Invoicing", "Other"],
  "FTL/PTL": ["Rate Mismatch", "Detention", "Shortage/Damage", "Wrong Invoicing", "Other"],
  "3PL": ["Storage Overbilling", "Inventory Loss/Damage", "Wrong Invoicing", "Other"],
};
const CN_STATUSES = ["raised", "partially received", "received", "rejected"];

const squash = (v) => String(v ?? "").toLowerCase().replace(/[\s_-]+/g, "");
const pick = (list, v) => list.find((x) => squash(x) === squash(v));
const CN_CATEGORY_ALIAS = { b2ccouriers: "B2C", b2ccourier: "B2C", courier: "B2C", ftl: "FTL/PTL", ptl: "FTL/PTL", ftlptl: "FTL/PTL" };
const cnCategory = (v) => pick(CN_CATEGORIES, v) ?? CN_CATEGORY_ALIAS[squash(v).replace("/", "")];

// Status follows the amounts. Only "rejected" is a judgement the amounts can't show, so it
// is the one value a person enters.
const cnStatus = (r) => {
  if (squash(r.status) === "rejected") return "rejected";
  const raised = num(r.raised_amount_ex_gst), received = num(r.received_amount_ex_gst);
  if (received <= 0) return "raised";
  return received < raised ? "partially received" : "received";
};

// Normalises a credit-note row in place and returns why it can't be saved, or null.
function validateCreditNote(r) {
  const cat = cnCategory(r.category);
  if (!cat) return `category "${r.category}" — use ${CN_CATEGORIES.join(" / ")}`;
  r.category = cat;
  const reason = pick(CN_REASONS[cat], r.reason);
  if (!reason) return `"${r.reason}" is not a ${cat} reason — use ${CN_REASONS[cat].join(", ")}`;
  r.reason = reason;
  r.partner_name = String(r.partner_name ?? "").trim();
  r.invoice_number = String(r.invoice_number ?? "").trim();
  if (!r.partner_name || !r.invoice_number) return "partner_name and invoice_number are mandatory";

  const amount = (v) => (String(v ?? "").trim() === "" ? null : Number(String(v).replace(/[,₹\s]/g, "")));
  const raised = amount(r.raised_amount_ex_gst), received = amount(r.received_amount_ex_gst);
  if (raised == null || !Number.isFinite(raised) || raised < 0) return "raised_amount_ex_gst must be a number, 0 or more";
  if (received != null && (!Number.isFinite(received) || received < 0)) return "received_amount_ex_gst must be a number, 0 or more";
  if (received != null && received > raised) return `received (${received}) is more than raised (${raised})`;
  r.raised_amount_ex_gst = String(raised);
  r.received_amount_ex_gst = received == null ? "" : String(received);

  for (const k of ["raised_on", "cn_date"]) {
    if (r[k] && !/^\d{4}-\d{2}-\d{2}$/.test(r[k])) return `${k} "${r[k]}" — use YYYY-MM-DD`;
  }
  if (String(r.status ?? "").trim() && !pick(CN_STATUSES, r.status)) return `status "${r.status}" — leave blank or use rejected`;
  r.status = cnStatus(r);
  return null;
}

// ── SCHEMA CONFIG ────────────────────────────────────────────────────────────

const FORMATS = {
  b2b: {
    key: "b2b",
    label: "FTL/PTL",
    icon: Truck,
    table: "logistics_invoices_b2b",
    templateFile: "b2b_courier_invoice_template.xlsx",
    exportPrefix: "b2b_freight_invoices",
    totalParts: ["freight_charge", "surcharge", "other_charge", "toll_charge"],
    totalField: "total_cost",
    uniqueKey: null,
    fields: [
      { key: "month_year", label: "month_year", type: "month", req: true, w: 110, ex: "2026-07", desc: "Billing period this invoice covers" },
      { key: "invoice_number", label: "invoice_number", type: "text", w: 150, ex: "TRN-INV-3321", desc: "Transporter's invoice/bill number" },
      { key: "invoice_value", label: "invoice_value", type: "num", w: 130, ex: "10650", desc: "Total invoice value billed by transporter" },
      { key: "transporter_name", label: "transporter_name", type: "text", req: true, w: 170, ex: "ABC Roadlines", desc: "Name of the B2B transporter" },
      { key: "reference_no", label: "reference_no", type: "text", w: 140, ex: "LR-778812", desc: "LR number or consignment reference" },
      { key: "origin_location", label: "origin_location", type: "text", req: true, w: 150, ex: "Bhiwandi WH", desc: "Warehouse/city goods dispatched from" },
      { key: "destination_location", label: "destination_location", type: "text", req: true, w: 170, ex: "Pune WH", desc: "Warehouse/city goods delivered to" },
      { key: "vehicle_number", label: "vehicle_number", type: "text", w: 140, ex: "MH12AB1234", desc: "Registration number of the vehicle" },
      { key: "vehicle_type", label: "vehicle_type", type: "text", w: 130, ex: "Eicher 14ft", desc: "Type/size of vehicle" },
      { key: "freight_type_FTL_PTL", label: "freight_type_FTL_PTL", type: "text", w: 165, ex: "PTL", desc: "FTL / PTL" },
      { key: "no_of_packages", label: "no_of_packages", type: "int", w: 130, ex: "120", desc: "Number of packages/cartons" },
      { key: "load_weight", label: "load_weight", type: "num", w: 120, ex: "2800", desc: "Actual weight loaded" },
      { key: "charged_weight", label: "charged_weight", type: "num", w: 135, ex: "2850", desc: "Weight the transporter billed on" },
      { key: "freight_charge", label: "freight_charge", type: "num", w: 130, ex: "9500", desc: "Base freight charge" },
      { key: "surcharge", label: "surcharge", type: "num", w: 110, ex: "650", desc: "Fuel surcharge or similar" },
      { key: "other_charge", label: "other_charge", type: "num", w: 120, ex: "300", desc: "Loading/unloading/detention or other charges" },
      { key: "toll_charge", label: "toll_charge", type: "num", w: 110, ex: "200", desc: "Toll charges billed separately" },
      { key: "total_cost", label: "total_cost", type: "num", req: true, computed: true, w: 120, ex: "10650", desc: "Grand total invoiced for this trip" },
      { key: "remarks", label: "remarks", type: "text", w: 200, ex: "Standard route, no dispute", desc: "Free-text note" },
    ],
    searchKeys: ["invoice_number", "transporter_name", "reference_no", "vehicle_number", "origin_location", "destination_location"],
    notes: [
      "One row = one freight bill line. Upload APPENDS rows — nothing is overwritten or de-duplicated.",
      "month_year must be YYYY-MM (e.g. 2026-07).",
      "total_cost is computed as freight_charge + surcharge + other_charge + toll_charge when left blank.",
      "freight_type_FTL_PTL expects FTL or PTL.",
    ],
  },
  b2c: {
    key: "b2c",
    label: "B2C · Courier",
    icon: Package,
    table: "logistics_invoices_b2c",
    templateFile: "b2c_courier_invoice_template.xlsx",
    exportPrefix: "b2c_courier_invoices",
    totalParts: ["freight_charge", "surcharge", "other_charge"],
    totalField: "total_cost",
    uniqueKey: "awb_number",
    fields: [
      { key: "month_year", label: "month_year", type: "month", req: true, w: 110, ex: "2026-07", desc: "Billing period this invoice covers" },
      { key: "invoice_number", label: "invoice_number", type: "text", w: 155, ex: "INV-DLV-0072451", desc: "Courier's invoice/bill number" },
      { key: "courier_name", label: "courier_name", type: "text", req: true, w: 140, ex: "Delhivery", desc: "Name of the B2C courier partner" },
      { key: "courier_account_type", label: "courier_account_type", type: "text", req: true, w: 175, ex: "Surface", desc: "Type of account/service" },
      { key: "awb_number", label: "awb_number", type: "text", req: true, w: 150, ex: "1234567890123", desc: "Airway Bill number — unique shipment identifier" },
      { key: "shipment_value", label: "shipment_value", type: "num", req: true, w: 130, ex: "1499", desc: "Declared order/shipment value" },
      { key: "shipment_date", label: "shipment_date", type: "date", w: 130, ex: "2026-07-05", desc: "Date shipment was dispatched" },
      { key: "order_id", label: "order_id", type: "text", w: 130, ex: "ORD-88213", desc: "Our internal order ID" },
      { key: "payment_mode", label: "payment_mode", type: "text", req: true, w: 130, ex: "Prepaid", desc: "Prepaid/COD" },
      { key: "shipment_mode", label: "shipment_mode", type: "text", req: true, w: 135, ex: "Forward", desc: "Forward / RTO / Reverse" },
      { key: "origin_pincode", label: "origin_pincode", type: "text", w: 130, ex: "411001", desc: "Pincode shipment sent from" },
      { key: "origin_city", label: "origin_city", type: "text", w: 120, ex: "Pune", desc: "City shipment sent from" },
      { key: "destination_pincode", label: "destination_pincode", type: "text", w: 165, ex: "560001", desc: "Pincode delivered to" },
      { key: "destination_city", label: "destination_city", type: "text", w: 145, ex: "Bengaluru", desc: "City delivered to" },
      { key: "zone", label: "zone", type: "text", req: true, w: 80, ex: "B", desc: "Courier zone classification" },
      { key: "product", label: "product", type: "text", w: 175, ex: "Neck Pillow - Grey", desc: "Product/SKU shipped" },
      { key: "qty", label: "qty", type: "int", w: 80, ex: "1", desc: "Quantity shipped" },
      { key: "charged_weight_courier", label: "charged_weight_courier", type: "num", req: true, w: 185, ex: "0.65", desc: "Weight courier billed on" },
      { key: "declared_weight_frido", label: "declared_weight_frido", type: "num", w: 180, ex: "0.55", desc: "Our recorded weight" },
      { key: "freight_charge", label: "freight_charge", type: "num", req: true, w: 130, ex: "62.50", desc: "Base freight charge" },
      { key: "surcharge", label: "surcharge", type: "num", req: true, w: 110, ex: "8.30", desc: "Fuel surcharge or similar" },
      { key: "other_charge", label: "other_charge", type: "num", w: 120, ex: "5", desc: "Any other charge not listed above" },
      { key: "total_cost", label: "total_cost", type: "num", req: true, computed: true, w: 120, ex: "84.20", desc: "Grand total invoiced for this shipment" },
      { key: "remarks", label: "remarks", type: "text", w: 200, ex: "Standard forward shipment", desc: "Free-text note" },
    ],
    searchKeys: ["invoice_number", "courier_name", "awb_number", "order_id", "destination_city", "origin_city", "zone", "product"],
    notes: [
      "Upload APPENDS all rows — duplicate AWB numbers are allowed and all rows are stored.",
      "Re-uploading the same file will add duplicate rows. Delete old data first if needed.",
      "month_year must be YYYY-MM. shipment_date should be YYYY-MM-DD.",
      "total_cost is computed as freight_charge + surcharge + other_charge when left blank.",
      "payment_mode expects Prepaid or COD. shipment_mode expects Forward, RTO or Reverse.",
    ],
  },
  threePL: {
    key: "threePL",
    label: "3PL · Warehousing",
    icon: Warehouse,
    table: "logistics_costs_3pl",
    templateFile: "3pl_cost_template.xlsx",
    exportPrefix: "3pl_warehousing_costs",
    totalParts: ["operation_fee", "rental_fee", "other_fee"],
    totalField: "total_cost",
    // One row per INVOICE per 3PL per warehouse per month, so a re-upload of the same
    // month corrects that month in place instead of doubling it.
    //
    // Keyed on FACILITY_PINCODE, not a facility name: the pincode is what joins this ledger
    // to Clickpost's pickup_pincode, so per-parcel and per-kg costs depend on it being
    // present and correct. Names vary between the invoice and the tracking feed; a pincode
    // does not.
    //
    // invoice_number is part of the key because a partner can bill one facility-month
    // across several invoices — operations on one, rental on another. Those are separate
    // bills that must each survive, not duplicates to be summed. Without it a 47-line
    // upload collapsed to 36 rows and the invoice trail was lost. This matches the
    // logistics_costs_3pl_unique_key index on the table.
    uniqueKey: "month_year,threepl_logistics_name,facility_pincode,invoice_number",
    fields: [
      { key: "month_year", label: "month_year", type: "month", req: true, w: 110, ex: "2026-07", desc: "Billing period this invoice covers" },
      { key: "threepl_logistics_name", label: "3PL_Logistics_Name", type: "text", req: true, w: 190, ex: "Delhivery FC", desc: "Name of the 3PL partner billing you" },
      { key: "facility_name", label: "Facility_Name", type: "text", w: 170, ex: "Hexalog_GGN2", desc: "Facility as the partner names it" },
      { key: "facility_location", label: "Facility_Location", type: "text", w: 150, ex: "Bhiwandi", desc: "City or area the facility sits in" },
      { key: "facility_pincode", label: "Facility_Pincode", type: "text", req: true, w: 140, ex: "421302", desc: "Pincode of the facility — joins to shipment volume" },
      { key: "invoice_number", label: "invoice_number", type: "text", w: 155, ex: "3PL-INV-20713", desc: "Partner's invoice/bill number" },
      { key: "operation_fee", label: "operation_fee", type: "num", w: 130, ex: "185000", desc: "Pick, pack and despatch handling charges" },
      { key: "rental_fee", label: "rental_fee", type: "num", w: 120, ex: "260000", desc: "Storage or space rental for the period" },
      { key: "other_fee", label: "other_fee", type: "num", w: 120, ex: "15500", desc: "Any other charge not covered above" },
      { key: "total_cost", label: "total_cost", type: "num", req: true, computed: true, w: 130, ex: "460500", desc: "Grand total invoiced for the period" },
      { key: "remarks", label: "remarks", type: "text", w: 220, ex: "Includes one-off racking charge", desc: "Free-text note" },
    ],
    searchKeys: ["threepl_logistics_name", "facility_name", "facility_location", "facility_pincode", "invoice_number", "month_year"],
    notes: [
      "One row = one 3PL's charges for one facility for one month.",
      "Re-uploading the same month_year + 3PL_Logistics_Name + Facility_Pincode + invoice_number UPDATES that row rather than adding a duplicate.",
      "Facility_Pincode must match the pickup pincode the courier records for that facility — it is what links this bill to the parcels shipped, and cost per parcel / per kg stay blank without it.",
      "month_year must be YYYY-MM (e.g. 2026-07).",
      "total_cost is computed as operation_fee + rental_fee + other_fee when left blank.",
      "Leave a fee blank or 0 if the partner did not bill it that month.",
    ],
  },
  fixedVehicles: {
    key: "fixedVehicles",
    label: "FTL/PTL · Rental Fixed Vehicle",
    parent: "b2b",
    icon: Truck,
    table: "logistics_fixed_vehicles",
    templateFile: "fixed_vehicle_template.xlsx",
    exportPrefix: "fixed_vehicle_rentals",
    totalParts: [],
    totalField: "cost",
    uniqueKey: "month_year,vehicle_number",
    fields: [
      { key: "month_year", label: "month_year", type: "month", req: true, w: 110, ex: "2026-04", desc: "Month this rental covers" },
      { key: "location", label: "location", type: "text", req: true, w: 170, ex: "Talwade, Pune", desc: "Site the vehicle is stationed at" },
      { key: "transport_name", label: "transport_name", type: "text", req: true, w: 190, ex: "RN Transport", desc: "Transporter the vehicle is rented from" },
      { key: "vehicle_type", label: "vehicle_type", type: "text", w: 130, ex: "Pickup", desc: "Type/size of vehicle" },
      { key: "vehicle_number", label: "vehicle_number", type: "text", req: true, w: 160, ex: "MH 14 JL 6920", desc: "Registration number" },
      { key: "agreed_km", label: "agreed_km", type: "num", w: 140, ex: "3000", desc: "Kilometres included in the monthly charge" },
      { key: "cost", label: "cost", type: "num", req: true, w: 130, ex: "55000", desc: "Fixed monthly charge for this vehicle" },
      { key: "remarks", label: "remarks", type: "text", w: 200, ex: "Contract renewed Apr'26", desc: "Free-text note" },
    ],
    searchKeys: ["location", "transport_name", "vehicle_number", "vehicle_type", "month_year"],
    notes: [
      "One row = one vehicle's fixed charge for one month.",
      "Re-uploading the same month_year + vehicle_number UPDATES that row rather than adding a duplicate.",
      "month_year must be YYYY-MM (e.g. 2026-04).",
      "cost is the standing monthly charge, not a per-trip rate — it is reported separately from FTL/PTL freight and never divided by trips.",
      "agreed_km is the distance included in that charge, for tracking overruns.",
    ],
  },
  creditNotes: {
    key: "creditNotes",
    label: "Credit Notes",
    // Opened from its own Documents card (App.jsx 'logistics-cn'), not as a bill-ledger tab.
    standalone: true,
    pageTitle: "Logistics Credit Notes",
    kicker: "Claim-wise · per invoice",
    addLabel: "Add claim",
    icon: Receipt,
    table: "logistics_credit_notes",
    templateFile: "logistics_credit_note_template.xlsx",
    exportPrefix: "logistics_credit_notes",
    totalParts: [],
    totalField: "raised_amount_ex_gst",
    partyField: "partner_name",
    // One claim per invoice per reason. The row is uploaded when the claim is raised and
    // uploaded again once the CN arrives, which fills in the received side in place.
    uniqueKey: "category,partner_name,invoice_number,reason",
    // Two lines for the same claim in one file are a mistake to fix, not bills to add up
    // as the 3PL ledger does: summing would double the raised amount.
    rejectDuplicates: true,
    validate: validateCreditNote,
    fields: [
      { key: "category", label: "category", type: "text", req: true, w: 110, ex: "B2C", desc: "B2C, FTL/PTL or 3PL", list: () => "cn-category" },
      { key: "partner_name", label: "partner_name", type: "text", req: true, w: 160, ex: "Delhivery", desc: "Courier, transporter or 3PL, spelled as in the Logistics Bill Ledger" },
      { key: "month_year", label: "month_year", type: "month", req: true, w: 110, ex: "2026-08", desc: "Month of the invoice the CN is raised against" },
      { key: "invoice_number", label: "invoice_number", type: "text", req: true, w: 160, ex: "INV-DLV-0081234", desc: "Partner invoice the CN is raised against" },
      { key: "reason", label: "reason", type: "text", req: true, w: 160, ex: "Weight Dispute", desc: "Why the CN is claimed (allowed values below)", list: (r) => `cn-reason-${cnCategory(r.category) ?? "B2C"}` },
      { key: "raised_amount_ex_gst", label: "raised_amount_ex_gst", type: "num", req: true, w: 180, ex: "45000", desc: "Amount claimed, ex-GST" },
      { key: "raised_on", label: "raised_on", type: "date", w: 120, ex: "2026-09-10", desc: "Date the claim was sent to the partner" },
      { key: "cn_number", label: "cn_number", type: "text", w: 140, ex: "", desc: "Partner's credit note number, once issued" },
      { key: "received_amount_ex_gst", label: "received_amount_ex_gst", type: "num", w: 190, ex: "", desc: "Amount credited, ex-GST. Blank until the CN arrives" },
      { key: "cn_date", label: "cn_date", type: "date", w: 120, ex: "", desc: "Date on the partner's credit note" },
      { key: "status", label: "status", type: "text", w: 150, ex: "", desc: "Leave blank (worked out from the amounts), or enter rejected", list: () => "cn-status" },
      { key: "remarks", label: "remarks", type: "text", w: 220, ex: "Charged 2 kg slab on 0.5 kg parcels", desc: "Free-text note" },
    ],
    searchKeys: ["category", "partner_name", "invoice_number", "reason", "cn_number", "status", "month_year"],
    notes: [
      "One row = one credit-note claim against ONE invoice for ONE reason. A claim on the same invoice for two reasons is two rows.",
      "Re-uploading the same category + partner_name + invoice_number + reason UPDATES that claim. Upload the claim when raised, then again with cn_number and received_amount_ex_gst once the CN arrives.",
      "All amounts are ex-GST. received_amount_ex_gst cannot be more than raised_amount_ex_gst.",
      "category: B2C, FTL/PTL or 3PL.",
      ...CN_CATEGORIES.map((c) => `reason for ${c}: ${CN_REASONS[c].join(", ")}.`),
      "status: leave blank and it is set from the amounts (raised / partially received / received). Enter rejected when the partner refuses the claim.",
      "If one claim is settled by several CNs, list them in cn_number (e.g. CN-101 + CN-117) and enter the combined received amount.",
      "month_year is YYYY-MM; raised_on and cn_date are YYYY-MM-DD.",
    ],
  },
};

// ── DATA LAYER ───────────────────────────────────────────────────────────────

const PK = "id";

// uniqueKey is a comma-separated column list so a format can be keyed on a
// combination (3PL is one row per month + partner + warehouse). These helpers let
// the single-column formats keep working unchanged.
const keyFields = (fmt) => (fmt.uniqueKey ? fmt.uniqueKey.split(",").map((k) => k.trim()).filter(Boolean) : []);
const keyOf = (fmt, row) => keyFields(fmt).map((k) => String(row?.[k] ?? "").trim().toLowerCase()).join(" | ");
const keyLabel = (fmt) => keyFields(fmt).map((k) => fmt.fields.find((f) => f.key === k)?.label ?? k).join(" + ");

const db = {
  async fetchRows(fmt, monthFilter) {
    // Always show only 200 rows in UI regardless of filter — exports handle full data
    let q = supabase.from(fmt.table).select("*").order("month_year", { ascending: false }).order(PK, { ascending: false });
    if (monthFilter) q = q.eq("month_year", monthFilter);
    q = q.limit(200);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },

  async fetchMonths(fmt) {
    const { data, error } = await supabase.rpc("get_logistics_months", { tbl: fmt.table });
    if (error) throw error;
    return (data ?? []).map((r) => r.month_year).filter(Boolean);
  },

  // Partner x month upload coverage for every month in the ledger.
  //
  // Aggregated in the database (see scripts/sql/get_logistics_partner_matrix.sql) rather
  // than derived from the grid: the grid holds 200 rows and the b2c ledger is ~1.5M, so
  // "which couriers are in which month" is not a question the loaded page can answer.
  //
  // Returns only partner-months that HAVE data; the gaps are what the UI draws.
  async fetchCoverage(fmt) {
    const { data, error } = await supabase.rpc("get_logistics_partner_matrix", {
      tbl: fmt.table,
    });
    if (error) throw error;
    return data ?? [];
  },

  async fetchAllRows(fmt, months, onProgress) {
    const selected = Array.isArray(months) ? months : (months ? [months] : []);
    const monthParam = selected.length === 1
      ? `&month_year=eq.${encodeURIComponent(selected[0])}`
      : selected.length > 1
        ? `&month_year=in.(${selected.join(",")})`
        : "";
    const base = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${fmt.table}?select=*&order=month_year.desc,id.desc${monthParam}`;
    // The signed-in user's token, not the anon key: tables whose RLS reads
    // auth.role() = 'authenticated' (3PL, fixed vehicles, credit notes) return no rows to anon.
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
    const hdrs = { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, Accept: "application/json", Prefer: "count=none" };
    // Sequential pagination — unknown total upfront, progress shows rows fetched so far
    const PAGE = 1000;
    const all = [];
    let offset = 0;
    onProgress?.(0, null);
    while (true) {
      const batch = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          fetch(`${base}&limit=${PAGE}&offset=${offset + i * PAGE}`, { headers: hdrs })
            .then((r) => r.json())
            .then((r) => Array.isArray(r) ? r : [])
        )
      );
      let done = false;
      for (const rows of batch) {
        all.push(...rows);
        if (rows.length < PAGE) { done = true; break; } // this page was last — stop
      }
      onProgress?.(all.length, null);
      if (done) break;
      offset += 10 * PAGE;
    }
    return all;
  },

  async insertRows(fmt, rows, onProgress) {
    const PAGE = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += PAGE) {
      let chunk = rows.slice(i, i + PAGE).map((r) => toDbRow(fmt, r));
      // Split invoice lines for one facility-month are summed, not overwritten.
      chunk = mergeDuplicateRows(fmt, chunk);
      const q = fmt.uniqueKey
        ? supabase.from(fmt.table).upsert(chunk, { onConflict: fmt.uniqueKey, ignoreDuplicates: false })
        : supabase.from(fmt.table).insert(chunk);
      const { error } = await q;
      if (error) throw error;
      inserted += chunk.length;
      onProgress?.(inserted, rows.length);
      // Yield to browser every 5 chunks so UI stays responsive
      if ((i / PAGE) % 5 === 4) await new Promise((r) => setTimeout(r, 0));
    }
    return [];
  },

  async updateRow(fmt, row) {
    if (!row[PK]) return;
    const { error } = await supabase.from(fmt.table).update(toDbRow(fmt, row)).eq(PK, row[PK]);
    if (error) throw error;
  },

  async deleteRow(fmt, row) {
    if (!row[PK]) return;
    const { error } = await supabase.from(fmt.table).delete().eq(PK, row[PK]);
    if (error) throw error;
  },
};

// ── HELPERS ──────────────────────────────────────────────────────────────────

const SAMPLE2 = {
  b2b: {
    month_year: "2026-07", invoice_number: "TRN-INV-3355", transporter_name: "XYZ Logistics",
    reference_no: "LR-778950", origin_location: "Pune WH", destination_location: "Bhiwandi WH",
    vehicle_number: "MH14CD5678", vehicle_type: "32ft SXL", freight_type_FTL_PTL: "FTL",
    no_of_packages: "480", load_weight: "9200", charged_weight: "9200",
    freight_charge: "28000", surcharge: "1900", other_charge: "1200", toll_charge: "450",
    total_cost: "31550", remarks: "Detention charge of Rs 1200 included in other_charge",
  },
  b2c: {
    month_year: "2026-07", invoice_number: "INV-DLV-0072498", courier_name: "Bluedart",
    courier_account_type: "Express", awb_number: "9988776655443", shipment_value: "2299",
    shipment_date: "2026-07-12", order_id: "ORD-88340", payment_mode: "COD",
    shipment_mode: "RTO", origin_pincode: "560001", origin_city: "Bengaluru",
    destination_pincode: "411001", destination_city: "Pune", zone: "C",
    product: "Lumbar Support Cushion", qty: "2", charged_weight_courier: "1.10",
    declared_weight_frido: "1", freight_charge: "95", surcharge: "12", other_charge: "20",
    total_cost: "152", remarks: "RTO due to customer refusal",
  },
  creditNotes: {
    category: "3PL", partner_name: "Hexalog", month_year: "2026-07", invoice_number: "3PL-INV-20713",
    reason: "Storage Overbilling", raised_amount_ex_gst: "18000", raised_on: "2026-08-05",
    cn_number: "CN-HX-0412", received_amount_ex_gst: "18000", cn_date: "2026-08-28",
    status: "", remarks: "Billed 1,200 sq ft against 1,000 agreed",
  },
};

const uid = () => Math.random().toString(36).slice(2, 10);
const todayMonth = () => new Date().toISOString().slice(0, 7);
const todayDate = () => new Date().toISOString().slice(0, 10);
const num = (v) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
const numOrNull = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const numOrRaw = (v) => { if (v === "" || v == null) return ""; const n = Number(v); return Number.isFinite(n) ? n : v; };
const sumParts = (fmt, r) => fmt.totalParts.reduce((s, k) => s + num(r[k]), 0);

// Collapse rows that share an upsert key into one, summing the money columns.
//
// A partner can split one facility-month across several invoice lines — operations on one,
// rental on another. Those share the key, so the old "last row wins" dedupe silently dropped
// the earlier line: 13.14L of Gurgaon operations and 6.75L of Bangalore rental disappeared
// on upload with no error anywhere.
//
// Money is additive, so totalParts are summed and the total recomputed from them. Invoice
// numbers are joined so a merged row still traces back to every bill behind it, and
// descriptive fields keep the first non-empty value rather than being overwritten by a
// later line that happened to leave them blank.
//
// Used by BOTH upload paths. It lives here rather than inline precisely because the two
// copies of the inline version had already drifted — one was fixed, the other was not, and
// the unfixed one is what the UI actually calls.
function mergeDuplicateRows(fmt, rows) {
  // rejectDuplicates formats are de-duplicated (and the extras reported) before this.
  if (!fmt.uniqueKey || fmt.rejectDuplicates) return rows;
  const seen = new Map();
  for (const r of rows) {
    const k = keyOf(fmt, r);
    const prev = seen.get(k);
    if (!prev) { seen.set(k, r); continue; }
    for (const f of fmt.totalParts || []) prev[f] = num(prev[f]) + num(r[f]);
    if (fmt.totalField) {
      prev[fmt.totalField] = (fmt.totalParts || []).length
        ? sumParts(fmt, prev)
        : num(prev[fmt.totalField]) + num(r[fmt.totalField]);
    }
    if (r.invoice_number && prev.invoice_number !== r.invoice_number) {
      prev.invoice_number = [prev.invoice_number, r.invoice_number].filter(Boolean).join(' + ');
    }
    for (const f of fmt.fields) {
      const key = f.key;
      if (f.type === 'num' || key === 'invoice_number') continue;
      const cur = prev[key];
      if ((cur === null || cur === undefined || cur === '') && r[key]) prev[key] = r[key];
    }
  }
  return [...seen.values()];
}
const effectiveTotal = (fmt, r) => {
  const explicit = r[fmt.totalField];
  if (explicit !== "" && explicit != null) { const n = Number(explicit); if (Number.isFinite(n)) return n; }
  const parts = sumParts(fmt, r);
  return parts === 0 ? "" : parts;
};
const isTotalOverridden = (fmt, r) => r[fmt.totalField] !== "" && r[fmt.totalField] != null;
const money = (v) => v === "" || v == null ? "" : Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const blankRow = (fmt) => { const r = { _uid: uid(), [PK]: null }; for (const f of fmt.fields) r[f.key] = ""; r.month_year = todayMonth(); return r; };
const hasContent = (fmt, r) => fmt.fields.some((f) => f.req && String(r[f.key] ?? "").trim() !== "");

const normMonth = (v) => {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 7);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, "0")}`;
  if (/^\d{4,6}$/.test(s)) { const d = XLSX.SSF ? XLSX.SSF.parse_date_code(+s) : null; if (d && d.y) return `${d.y}-${String(d.m).padStart(2, "0")}`; }
  const d2 = new Date(s);
  if (!isNaN(d2)) return d2.toISOString().slice(0, 7);
  return null;
};

const normDate = (v) => {
  if (v == null || v === "") return "";
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${String(+dmy[2]).padStart(2, "0")}-${String(+dmy[1]).padStart(2, "0")}`;
  if (/^\d{4,6}$/.test(s)) { const d = XLSX.SSF ? XLSX.SSF.parse_date_code(+s) : null; if (d && d.y) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`; }
  const d2 = new Date(s);
  return isNaN(d2) ? s : d2.toISOString().slice(0, 10);
};

const normHead = (c) => String(c ?? "").trim().toLowerCase().replace(/\s*\*\s*$/, "").replace(/\s*\((mandatory|optional|required|computed|auto)\)\s*$/i, "").replace(/[\s_]+/g, " ").trim();
const headKey = (f) => normHead(f.label);

const toDbRow = (fmt, r) => {
  const out = {};
  for (const f of fmt.fields) {
    const v = r[f.key];
    if (v === "" || v == null) { out[f.key] = null; continue; }
    if (f.type === "num" || f.type === "int") { const n = Number(v); out[f.key] = Number.isFinite(n) ? n : null; }
    else out[f.key] = String(v);
  }
  out[fmt.totalField] = numOrNull(effectiveTotal(fmt, r));
  if (r[PK]) out[PK] = r[PK];
  return out;
};

const fromDbRow = (fmt, d) => {
  const r = { _uid: uid(), [PK]: d[PK] ?? null };
  for (const f of fmt.fields) r[f.key] = d[f.key] == null ? "" : String(d[f.key]);
  return r;
};

// ── CREDIT NOTE SUMMARY ──────────────────────────────────────────────────────

// Category × reason roll-up of the credit-note register against what each category was
// invoiced, laid out like finance's CN sheet: one block per category, reasons beneath.
//
// Invoice totals come from get_logistics_cn_summary(), which reads an hourly snapshot of the
// bill ledgers (logistics_invoice_totals): summing the 1.5M-row B2C ledger live overruns the
// statement timeout. CN rows are read straight from their table, so they are always current.
function CnSummary({ C, months, version }) {
  const [cn, setCn] = useState(null);
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState(null);
  const [partner, setPartner] = useState("");

  useEffect(() => {
    let live = true;
    setError(null);
    Promise.all([
      db.fetchAllRows(FORMATS.creditNotes, []),
      supabase.rpc("get_logistics_cn_summary").then(({ data, error }) => { if (error) throw error; return data; }),
    ])
      .then(([rows, summary]) => { if (live) { setCn(rows); setFeed(summary); } })
      .catch((e) => { if (live) setError(e.message ?? String(e)); });
    return () => { live = false; };
  }, [version]);

  const view = useMemo(() => {
    if (!cn || !feed) return null;
    const inMonth = (m) => !months.length || months.includes(m);
    const inPartner = (name) => !partner || String(name ?? "").trim().toLowerCase() === partner;

    const blank = () => ({ invoice: 0, raised: 0, received: 0, rejected: 0, pending: 0, n: 0 });
    const add = (t, r) => {
      const raised = num(r.raised_amount_ex_gst), received = num(r.received_amount_ex_gst);
      const rejected = cnStatus(r) === "rejected" ? Math.max(0, raised - received) : 0;
      t.raised += raised; t.received += received; t.rejected += rejected;
      t.pending += Math.max(0, raised - received - rejected); t.n += 1;
    };

    const blocks = CN_CATEGORIES.map((cat) => ({ cat, total: blank(), reasons: CN_REASONS[cat].map((reason) => ({ reason, ...blank() })) }));
    const byCat = Object.fromEntries(blocks.map((b) => [b.cat, b]));
    const grand = blank();

    for (const r of feed.invoices ?? []) {
      if (!byCat[r.category] || !inMonth(r.month_year) || !inPartner(r.partner)) continue;
      byCat[r.category].total.invoice += num(r.amount);
      grand.invoice += num(r.amount);
    }
    const unmatchedIds = new Set(feed.unmatched ?? []);
    let unmatched = 0;
    for (const r of cn) {
      const b = byCat[r.category];
      if (!b || !inMonth(r.month_year) || !inPartner(r.partner_name)) continue;
      add(b.total, r); add(grand, r);
      const line = b.reasons.find((x) => x.reason === r.reason);
      if (line) add(line, r);
      if (unmatchedIds.has(r.id)) unmatched += 1;
    }

    const names = new Map();
    for (const n of [...cn.map((r) => r.partner_name), ...(feed.invoices ?? []).map((r) => r.partner)]) {
      const s = String(n ?? "").trim();
      if (s && !names.has(s.toLowerCase())) names.set(s.toLowerCase(), s);
    }
    const partners = [...names].sort((a, b) => a[1].localeCompare(b[1]));
    return { blocks, grand, unmatched, partners };
  }, [cn, feed, months, partner]);

  if (error) return <div style={{ marginBottom: 12, fontSize: 12.5, color: C.red }}>Couldn't load the credit-note summary: {error}</div>;
  if (!view) return <div style={{ marginBottom: 12, fontSize: 12.5, color: C.t3 }}>Loading summary…</div>;

  const rs = (v) => (v ? `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—");
  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
  const th = { padding: "8px 12px", fontSize: 11, fontWeight: 700, color: C.t2, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${C.border}`, textAlign: "right", whiteSpace: "nowrap", background: C.ach };
  const td = { padding: "7px 12px", textAlign: "right", fontFamily: "monospace", whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}` };
  const label = { ...td, textAlign: "left", fontFamily: "inherit" };
  // Total invoice is shown on category and grand-total rows only: an invoice is not split
  // by reason, so a per-reason figure would just repeat the category's.
  const cells = (t, showInvoice) => [
    showInvoice ? rs(t.invoice) : "", rs(t.raised), rs(t.received), rs(t.pending), rs(t.rejected), pct(t.received, t.raised),
  ];

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>Summary</div>
        <select value={partner} onChange={(e) => setPartner(e.target.value)}
          style={{ fontSize: 12, padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.card, color: C.t1, fontFamily: "inherit" }}>
          <option value="">All partners</option>
          {view.partners.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
        </select>
        <span style={{ fontSize: 11, color: C.t3 }}>
          {months.length ? `Invoice months: ${months.join(", ")}` : "All invoice months"} · amounts ex-GST
        </span>
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "auto", background: C.card }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Category / reason</th>
              {["Total invoice", "Raised CN", "Received CN", "Pending", "Rejected", "Recovery %"].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {view.blocks.map((b) => (
              <Fragment key={b.cat}>
                <tr style={{ fontWeight: 700, color: C.t1 }}>
                  <td style={label}>{CN_CATEGORY_LABEL[b.cat]}</td>
                  {cells(b.total, true).map((v, i) => <td key={i} style={td}>{v}</td>)}
                </tr>
                {b.reasons.map((x) => (
                  <tr key={x.reason} style={{ color: x.n ? C.t2 : C.t3 }}>
                    <td style={{ ...label, paddingLeft: 28 }}>{x.reason}</td>
                    {cells(x, false).map((v, i) => <td key={i} style={td}>{v}</td>)}
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr style={{ fontWeight: 800, color: C.t1 }}>
              <td style={{ ...label, borderBottom: "none" }}>Total</td>
              {cells(view.grand, true).map((v, i) => <td key={i} style={{ ...td, borderBottom: "none" }}>{v}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: C.t3, marginTop: 6, lineHeight: 1.6 }}>
        Pending = raised − received − rejected; rejected is the unreceived part of a claim marked <em>rejected</em>.
        Total invoice is the bill ledger as of {feed.refreshed_at ? new Date(feed.refreshed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"} (refreshed hourly).
        {view.unmatched > 0 && <> <strong style={{ color: C.red }}>{view.unmatched} B2C/3PL claim{view.unmatched === 1 ? "" : "s"}</strong> name an invoice number not found in that partner's bills.</>}
      </div>
    </div>
  );
}

// ── COMPONENT ─────────────────────────────────────────────────────────────────

// `only` opens one standalone format as its own page (Documents → Logistics Credit Notes).
export default function LogisticsLedgerPage({ onBack, only }) {
  const [tab, setTab] = useState(only ?? "b2b");
  // Bumped whenever the ledger is reloaded or saved, so the CN summary refetches with it.
  const [version, setVersion] = useState(0);
  const fmt = FORMATS[tab];
  const [store, setStore] = useState({ b2b: null, b2c: null });
  const [monthsStore, setMonthsStore] = useState({ b2b: [], b2c: [] });
  const [query, setQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState([]); // array of selected months, [] = all
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const monthPickerRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [exportProgress, setExportProgress] = useState(null); // null | { done, total, type }
  const [uploadProgress, setUploadProgress] = useState(null); // null | { done, total }
  const fileInput = useRef(null);
  // Upload checklist: which partners' bills are in for a given month.
  const [coverage, setCoverage] = useState({ b2b: null, b2c: null });
  // Open by default: the matrix is the point of the panel, and a gap three months back is
  // invisible behind a collapsed header. Collapsing is left to the user.
  const [coverageOpen, setCoverageOpen] = useState(true);

  const rows = store[tab] ?? [];
  const months = monthsStore[tab] ?? [];
  const setRows = useCallback(
    (fn) => setStore((s) => ({ ...s, [tab]: typeof fn === "function" ? fn(s[tab] ?? []) : fn })),
    [tab]
  );

  const flash = (kind, text) => {
    setStatus({ kind, text });
    if (kind !== "error") setTimeout(() => setStatus(null), 4000);
  };

  const load = useCallback(async (which, month) => {
    const f = FORMATS[which];
    setExportProgress(null);
    try {
      const [data, allMonths] = await Promise.all([
        db.fetchRows(f, month),
        db.fetchMonths(f),
      ]);
      setStore((s) => ({ ...s, [which]: data.map((d) => fromDbRow(f, d)) }));
      setMonthsStore((s) => ({ ...s, [which]: allMonths }));
      setVersion((v) => v + 1);

      // Upload coverage, every month at once. Refreshed on the same load() that follows an
      // upload, so adding a file fills its cells in without a manual reload.
      db.fetchCoverage(f)
        .then((c) => setCoverage((s) => ({ ...s, [which]: c })))
        // A missing RPC must not break the grid — the panel is additive, and the page was
        // useful without it. It just stays hidden.
        .catch(() => setCoverage((s) => ({ ...s, [which]: null })));
    } catch (e) {
      setStore((s) => ({ ...s, [which]: s[which] ?? [blankRow(f)] }));
      flash("error", `Couldn't load ${f.table}: ${e.message ?? e}`);
    }
  }, []);

  // single month passed to fetchRows for UI display (only when exactly 1 selected)
  const singleMonth = monthFilter.length === 1 ? monthFilter[0] : null;

  useEffect(() => { if (store[tab] == null && !uploadProgress) load(tab, singleMonth); }, [tab, store, load, uploadProgress]);

  // When month filter changes, re-fetch from DB
  const prevMonthRef = useRef(singleMonth);
  useEffect(() => {
    if (prevMonthRef.current === singleMonth) return;
    prevMonthRef.current = singleMonth;
    load(tab, singleMonth);
  }, [singleMonth, tab, load]);

  // Close month picker on outside click
  useEffect(() => {
    const handler = (e) => { if (monthPickerRef.current && !monthPickerRef.current.contains(e.target)) setMonthPickerOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => fmt.searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)));
  }, [rows, query, fmt]);

  const dupKeys = useMemo(() => {
    if (!fmt.uniqueKey) return new Set();
    const seen = new Map();
    for (const r of rows) { const v = keyOf(fmt, r); if (!v.replace(/s||/g, "")) continue; seen.set(v, (seen.get(v) ?? 0) + 1); }
    return new Set(Array.from(seen).filter(([, n]) => n > 1).map(([v]) => v));
  }, [rows, fmt]);

  const isDup = (r) => !!fmt.uniqueKey && dupKeys.has(keyOf(fmt, r));

  const totals = useMemo(() => {
    let amount = 0;
    for (const r of filtered) amount += num(effectiveTotal(fmt, r));
    return { count: filtered.length, amount };
  }, [filtered, fmt]);

  const setCell = (rid, key, val) => setRows((rs) => rs.map((r) => (r._uid === rid ? { ...r, [key]: val, _dirty: true } : r)));

  const commitCell = async (rid) => {
    const found = rows.find((r) => r._uid === rid);
    if (!found || !found._dirty || !found[PK]) return;
    const row = { ...found };
    const invalid = fmt.validate?.(row);
    // Left dirty, so the edit stays on screen to be corrected.
    if (invalid) { flash("error", `Not saved — ${invalid}`); return; }
    try {
      await db.updateRow(fmt, row);
      setRows((rs) => rs.map((r) => (r._uid === rid ? { ...row, _dirty: false } : r)));
      setVersion((v) => v + 1);
    } catch (e) { flash("error", `Save failed: ${e.message ?? e}`); }
  };

  const addRow = () => setRows((rs) => [blankRow(fmt), ...rs]);

  const deleteRow = async (rid) => {
    const row = rows.find((r) => r._uid === rid);
    if (!row) return;
    if (row[PK] && !confirm(`Delete invoice ${row.invoice_number || "(blank)"}? This removes it from Supabase.`)) return;
    setRows((rs) => rs.filter((r) => r._uid !== rid));
    try { await db.deleteRow(fmt, row); setVersion((v) => v + 1); } catch (e) { flash("error", `Delete failed: ${e.message ?? e}`); }
  };

  const saveAll = async () => {
    if (dupKeys.size) {
      const label = keyLabel(fmt);
      flash("error", `Fix duplicate ${label}s before saving: ${Array.from(dupKeys).slice(0, 5).join(", ")}`);
      return;
    }
    // Copies, so validation's normalising never touches the rows React is rendering.
    const fresh = rows.filter((r) => !r[PK] && hasContent(fmt, r)).map((r) => ({ ...r }));
    const dirty = rows.filter((r) => r[PK] && r._dirty).map((r) => ({ ...r }));
    if (!fresh.length && !dirty.length) { flash("ok", "Nothing to save — everything is already in Supabase."); return; }
    if (fmt.validate) {
      const invalid = [...fresh, ...dirty].map((r) => fmt.validate(r)).filter(Boolean);
      if (invalid.length) { flash("error", `Fix ${invalid.length} row${invalid.length === 1 ? "" : "s"} before saving — ${invalid[0]}`); return; }
    }
    setBusy(true);
    try {
      for (const r of dirty) await db.updateRow(fmt, r);
      let inserted = [];
      if (fresh.length) inserted = await db.insertRows(fmt, fresh);
      setVersion((v) => v + 1);
      setRows((rs) => {
        let i = 0;
        return rs.map((r) => {
          if (!r[PK] && hasContent(fmt, r)) { const got = inserted[i++]; return got ? { ...fromDbRow(fmt, got), _uid: r._uid } : { ...r, _dirty: false }; }
          return r._dirty ? { ...r, _dirty: false } : r;
        });
      });
      flash("ok", `Saved — ${fresh.length} inserted, ${dirty.length} updated.`);
    } catch (e) { flash("error", `Save failed: ${e.message ?? e}`); }
    finally { setBusy(false); }
  };

  const downloadTemplate = () => {
    const headerRow = fmt.fields.map((f) => f.req ? `${f.label} *` : f.label);
    const sampleRows = [0, 1].map((i) => fmt.fields.map((f) => { const v = (i === 0 ? f.ex : SAMPLE2[fmt.key]?.[f.key]) ?? ""; return f.type === "num" || f.type === "int" ? numOrRaw(v) : v; }));
    const ws = XLSXStyle.utils.aoa_to_sheet([headerRow, ...sampleRows]);
    ws["!cols"] = fmt.fields.map((f) => ({ wch: Math.max(14, f.label.length + 6) }));
    ws["!freeze"] = { r: 1, c: 0 };
    fmt.fields.forEach((f, c) => {
      const h = XLSXStyle.utils.encode_cell({ r: 0, c });
      if (ws[h]) ws[h].s = { font: { bold: true, color: { rgb: "000000" }, sz: 11 }, fill: { patternType: "solid", fgColor: { rgb: "FFD600" } }, alignment: { horizontal: "left" } };
    });
    const wb = XLSXStyle.utils.book_new();
    XLSXStyle.utils.book_append_sheet(wb, ws, "billing_data");
    const instrRows = fmt.fields.map((f) => [f.label, f.req ? "mandatory" : "optional", f.desc ?? ""]);
    const notes = XLSXStyle.utils.aoa_to_sheet([["fields", "mandatory/optional", "description"], ...instrRows, [""], ["How this file is uploaded"], ["1. Keep the header row on the billing_data sheet exactly as-is."], ["2. Delete the two grey sample rows, then add your bill lines below the header."], ...fmt.notes.map((n, i) => [`${i + 3}. ${n}`])]);
    notes["!cols"] = [{ wch: 26 }, { wch: 20 }, { wch: 96 }];
    XLSXStyle.utils.book_append_sheet(wb, notes, "instruction");
    XLSXStyle.writeFile(wb, fmt.templateFile);
  };

  const importTemplate = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show parsing state immediately before any heavy work
    setUploadProgress({ done: 0, total: 0, parsing: true });
    setBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const sampleSigs = [fmt.fields.reduce((o, f) => ((o[f.key] = f.ex ?? ""), o), {}), SAMPLE2[fmt.key] ?? {}];
        const sigKeys = [...(keyFields(fmt).length ? keyFields(fmt) : ["reference_no"]), "invoice_number"].filter(Boolean);

        // Worker streams chunks as it parses — we upload each chunk immediately (parse + upload in parallel)
        let uploaded = 0, totalValid = 0;
        // Rows the worker rejected for missing mandatory fields — reported, never dropped silently
        let badRows = [];
        // Rows with every mandatory column but a value the format's validate() refuses, or
        // a repeat of a claim earlier in the file. Reported with the reason, never dropped silently.
        const invalidRows = [];
        const seenKeys = new Map();
        // Every parsed row, held until the worker finishes so duplicates can be merged
        // across the whole file rather than per streamed chunk.
        const pendingRows = [];
        await new Promise((resolve, reject) => {
          const worker = new Worker("/xlsx-worker.js");
          // Queue of chunks waiting to be uploaded; we process sequentially
          const uploadQueue = [];
          let workerDone = false;
          let uploading = false;

          const processQueue = async () => {
            if (uploading) return;
            uploading = true;
            while (uploadQueue.length > 0) {
              const chunk = uploadQueue.shift();
              // Collect only — the merge has to see the WHOLE file, not one chunk.
              // The worker streams fixed-size batches, so two invoice lines sharing an
              // upsert key routinely land in different chunks. Merging per chunk misses
              // them and the unique index then drops one via ON CONFLICT.
              for (const r of chunk) {
                const invalid = fmt.validate?.(r);
                if (invalid) { invalidRows.push({ line: r._line, why: invalid }); continue; }
                if (fmt.rejectDuplicates) {
                  const k = keyOf(fmt, r);
                  if (seenKeys.has(k)) { invalidRows.push({ line: r._line, why: `same ${keyLabel(fmt)} as Excel row ${seenKeys.get(k)}` }); continue; }
                  seenKeys.set(k, r._line);
                }
                pendingRows.push(toDbRow(fmt, r));
                uploaded += 1;
              }
              setUploadProgress({ done: uploaded, total: totalValid || uploaded });
            }
            uploading = false;
            if (workerDone) resolve();
          };

          worker.onmessage = async (ev) => {
            const msg = ev.data;
            if (msg.type === "error") {
              worker.terminate();
              if (msg.error === "header_not_found") {
                reject(new Error(`header_not_found||${(msg.reqLabels || []).join(", ")}`));
              } else {
                reject(new Error(msg.error));
              }
            } else if (msg.type === "chunk") {
              totalValid = msg.total;
              setUploadProgress({ done: uploaded, total: msg.total });
              uploadQueue.push(msg.rows);
              processQueue();
            } else if (msg.type === "done") {
              workerDone = true;
              badRows = msg.bad || [];
              worker.terminate();
              // Everything is parsed: merge duplicates across the FULL set, then send.
              const flush = async () => {
                while (uploading) await new Promise((r) => setTimeout(r, 30));
                try {
                  const merged = mergeDuplicateRows(fmt, pendingRows);
                  const PAGE = 500;
                  for (let i = 0; i < merged.length; i += PAGE) {
                    const page = merged.slice(i, i + PAGE);
                    const q = fmt.uniqueKey
                      ? supabase.from(fmt.table).upsert(page, { onConflict: fmt.uniqueKey, ignoreDuplicates: false })
                      : supabase.from(fmt.table).insert(page);
                    const { error } = await q;
                    if (error) { reject(error); return; }
                  }
                  setUploadProgress({ done: totalValid || merged.length, total: totalValid || merged.length });
                  resolve();
                } catch (e) { reject(e); }
              };
              flush();
            }
          };
          worker.onerror = (ev) => { worker.terminate(); reject(new Error(ev.message)); };
          worker.postMessage({
            buffer: reader.result,
            // `list` is a function and postMessage cannot clone functions.
            fields: fmt.fields.map(({ list, ...f }) => f),
            sampleSigs,
            sigKeys,
            totalParts: fmt.totalParts,
            totalField: fmt.totalField,
            chunkSize: 500,
          });
        });

        setUploadProgress({ done: uploaded, total: uploaded, finished: true });
        if (invalidRows.length) {
          const detail = invalidRows.slice(0, 20).map((b) => `• Excel row ${b.line}: ${b.why}`).join("\n");
          alert(`${invalidRows.length} row(s) were NOT uploaded:\n\n${detail}${invalidRows.length > 20 ? `\n… and ${invalidRows.length - 20} more` : ""}\n\nFix them and re-upload; rows already uploaded are updated, not duplicated.`);
        }
        if (badRows.length) {
          // Group by the missing columns so a shifted/blank column reads as one line, not hundreds
          const byMissing = new Map();
          for (const b of badRows) {
            const k = b.missing.join(", ");
            if (!byMissing.has(k)) byMissing.set(k, []);
            byMissing.get(k).push(b.line);
          }
          const detail = [...byMissing].map(([cols, lines]) =>
            `• ${lines.length} row(s) missing: ${cols}\n   Excel rows ${lines.slice(0, 15).join(", ")}${lines.length > 15 ? ", …" : ""}`).join("\n");
          alert(`${badRows.length} row(s) were NOT uploaded because mandatory columns are empty.\n${uploaded} row(s) uploaded.\n\n${detail}\n\nCheck the data is under the right headers (columns may be shifted), fix and re-upload only the skipped rows.`);
        }
        const skipped = badRows.length + invalidRows.length;
        if (uploaded) flash("ok", `Uploaded ${uploaded} rows to ${fmt.table}${skipped ? ` — ${skipped} skipped` : ""}.`);
        else flash("error", `Nothing uploaded to ${fmt.table}${skipped ? ` — all ${skipped} rows were skipped` : ""}.`);
        setTimeout(() => setUploadProgress(null), 4000);
        // Reload grid and months after upload
        load(tab, singleMonth);
        db.fetchMonths(fmt).then((m) => setMonthsStore((s) => ({ ...s, [tab]: m }))).catch(() => {});
      } catch (err) {
        setUploadProgress(null);
        if (err.message?.startsWith("header_not_found||")) {
          const cols = err.message.split("||")[1];
          alert(`Couldn't find the header row for ${fmt.label}.\n\nRequired columns: ${cols}.\n\nUse 'Download template' and keep its header row intact.`);
        } else {
          alert(`Upload failed: ${err.message ?? err}`);
        }
      } finally {
        setBusy(false);
        if (fileInput.current) fileInput.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const exportCSV = async () => {
    setBusy(true);
    setExportProgress({ done: 0, total: 0, type: "CSV" });
    try {
      const all = await db.fetchAllRows(fmt, monthFilter, (done, total) => setExportProgress({ done, total, type: "CSV" }));
      const data = all.map((d) => fromDbRow(fmt, d)).filter((r) => hasContent(fmt, r));
      if (!data.length) return alert("Nothing to export.");
      const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const lines = [fmt.fields.map((f) => esc(f.label)).join(",")];
      for (const r of data) lines.push(fmt.fields.map((f) => esc(f.key === fmt.totalField ? effectiveTotal(fmt, r) : r[f.key] ?? "")).join(","));
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${fmt.exportPrefix}_${todayDate()}.csv` });
      a.click(); URL.revokeObjectURL(a.href);
      setExportProgress({ done: data.length, total: data.length, type: "CSV", finished: true });
      setTimeout(() => setExportProgress(null), 3000);
    } catch (e) { flash("error", `Export failed: ${e.message ?? e}`); setExportProgress(null); }
    finally { setBusy(false); }
  };

  const exportXLSX = async () => {
    setBusy(true);
    setExportProgress({ done: 0, total: 0, type: "Excel" });
    try {
      const all = await db.fetchAllRows(fmt, monthFilter, (done, total) => setExportProgress({ done, total, type: "Excel" }));
      const data = all.map((d) => fromDbRow(fmt, d)).filter((r) => hasContent(fmt, r));
      if (!data.length) return alert("Nothing to export.");
      // For large datasets (>50k rows) Excel generation freezes the browser — use CSV instead
      if (data.length > 50000) {
        const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
        const lines = [fmt.fields.map((f) => esc(f.label)).join(",")];
        for (const r of data) lines.push(fmt.fields.map((f) => esc(f.key === fmt.totalField ? effectiveTotal(fmt, r) : r[f.key] ?? "")).join(","));
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${fmt.exportPrefix}_${todayDate()}.csv` });
        a.click(); URL.revokeObjectURL(a.href);
        setExportProgress({ done: data.length, type: "CSV (large dataset, auto-converted)", finished: true });
        setTimeout(() => setExportProgress(null), 4000);
        return;
      }
      const green = "1F5C4A";
      const styleHdr = (ws, n) => { for (let c = 0; c < n; c++) { const a = XLSX.utils.encode_cell({ r: 0, c }); if (ws[a]) ws[a].s = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 }, fill: { fgColor: { rgb: green } } }; } };
      const head = fmt.fields.map((f) => f.label);
      const body = data.map((r) => fmt.fields.map((f) => f.key === fmt.totalField ? numOrRaw(effectiveTotal(fmt, r)) : f.type === "num" || f.type === "int" ? numOrRaw(r[f.key]) : r[f.key] ?? ""));
      const wsAll = XLSX.utils.aoa_to_sheet([head, ...body]);
      wsAll["!cols"] = fmt.fields.map((f) => ({ wch: Math.max(12, Math.round(f.w / 8)) }));
      styleHdr(wsAll, head.length);
      const party = fmt.partyField ?? (fmt.key === "b2b" ? "transporter_name" : "courier_name");
      const agg = new Map();
      for (const r of data) { const k = `${r.month_year}||${r[party] || "(blank)"}`; const cur = agg.get(k) ?? { lines: 0, amount: 0 }; cur.lines += 1; cur.amount += num(effectiveTotal(fmt, r)); agg.set(k, cur); }
      const sumHead = ["Month Year", fmt.fields.find((f) => f.key === party).label, "Lines", fmt.key === "creditNotes" ? "Raised (ex-GST)" : "Total Cost"];
      const sumBody = Array.from(agg.entries()).sort(([a], [b]) => (a < b ? 1 : -1)).map(([k, v]) => { const [m, p] = k.split("||"); return [m, p, v.lines, Number(v.amount.toFixed(2))]; });
      const wsSum = XLSX.utils.aoa_to_sheet([sumHead, ...sumBody]);
      wsSum["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 10 }, { wch: 16 }];
      styleHdr(wsSum, sumHead.length);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsAll, "Invoice Lines");
      XLSX.utils.book_append_sheet(wb, wsSum, "Month Summary");
      XLSX.writeFile(wb, `${fmt.exportPrefix}_${todayDate()}.xlsx`);
      setExportProgress({ done: data.length, type: "Excel", finished: true });
      setTimeout(() => setExportProgress(null), 3000);
    } catch (e) { flash("error", `Export failed: ${e.message ?? e}`); setExportProgress(null); }
    finally { setBusy(false); }
  };

  const unsaved = rows.filter((r) => (!r[PK] && hasContent(fmt, r)) || r._dirty).length;
  const TabIcon = fmt.icon;

  // light theme matching other dashboard tabs
  // Theme tokens, not a private palette: this page used to keep a fixed grey/green
  // look whatever theme was active. green/red stay semantic (success/error).
  const C = { bg: BASE_C.bg, card: BASE_C.card, border: BASE_C.border, t1: BASE_C.t1, t2: BASE_C.t2, t3: BASE_C.t3, accent: BASE_C.acc, green: BASE_C.green.tx, red: BASE_C.red.tx };

  const btnBase = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${C.border}` };
  const ghostBtn = { ...btnBase, background: C.card, color: C.t2 };
  const primaryBtn = { ...btnBase, background: C.accent, color: '#fff', border: 'none' };
  const chipBtn = { ...btnBase, background: '#EAF1EC', color: C.accent, borderRadius: 20 };
  const chipHot = { background: '#FEF3C7', color: '#92400E', borderColor: '#FDE68A' };

  return (
    <div style={{ padding: '24px 32px 48px', minHeight: 'var(--app-h)', background: C.bg, color: C.t1, fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          {onBack && (
            <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.card, border: `1.5px solid ${C.accent}`, color: C.accent, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', borderRadius: 20, marginBottom: 10 }}>
              <ArrowLeft size={14} /> Back to Documents
            </button>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>{fmt.kicker ?? 'Invoice-wise · transactional'}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.t1, letterSpacing: -0.5 }}>{only ? fmt.pageTitle : 'Logistics Bill Ledger'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 10px' }}>
            <Search size={13} style={{ color: C.t3 }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter invoices…"
              style={{ border: 'none', background: 'transparent', fontSize: 12, color: C.t1, width: 140, outline: 'none' }} />
          </div>
          <div ref={monthPickerRef} style={{ position: 'relative' }}>
            <button onClick={() => setMonthPickerOpen((o) => !o)}
              style={{ ...ghostBtn, padding: '6px 10px', minWidth: 120 }}>
              {monthFilter.length === 0 ? 'All months' : monthFilter.length === 1 ? monthFilter[0] : `${monthFilter.length} months`}
              <span style={{ marginLeft: 4, fontSize: 10 }}>▾</span>
            </button>
            {monthPickerOpen && (
              <div style={{ position: 'absolute', top: '110%', right: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, minWidth: 160, padding: '6px 0' }}>
                <div onClick={() => { setMonthFilter([]); setMonthPickerOpen(false); }}
                  style={{ padding: '7px 14px', fontSize: 12, cursor: 'pointer', fontWeight: monthFilter.length === 0 ? 700 : 400, color: monthFilter.length === 0 ? C.accent : C.t1, background: monthFilter.length === 0 ? '#EAF1EC' : 'transparent' }}>
                  All months
                </div>
                {months.map((m) => {
                  const checked = monthFilter.includes(m);
                  return (
                    <div key={m} onClick={() => setMonthFilter((prev) => checked ? prev.filter((x) => x !== m) : [...prev, m])}
                      style={{ padding: '7px 14px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, background: checked ? '#EAF1EC' : 'transparent', color: checked ? C.accent : C.t1, fontWeight: checked ? 600 : 400 }}>
                      <span style={{ width: 14, height: 14, border: `2px solid ${checked ? C.accent : C.t3}`, borderRadius: 3, background: checked ? C.accent : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {checked && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>}
                      </span>
                      {m}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <button style={ghostBtn} onClick={downloadTemplate}><FileSpreadsheet size={13} /> Template</button>
          <button style={ghostBtn} onClick={() => fileInput.current?.click()} disabled={busy}><Upload size={13} /> Upload</button>
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={importTemplate} style={{ display: 'none' }} />
          <button style={{ ...ghostBtn, opacity: exportProgress ? 0.5 : 1, cursor: exportProgress ? 'not-allowed' : 'pointer' }} onClick={exportProgress ? null : exportCSV} disabled={!!exportProgress}><Download size={13} /> CSV</button>
          <button style={{ ...primaryBtn, opacity: exportProgress ? 0.5 : 1, cursor: exportProgress ? 'not-allowed' : 'pointer' }} onClick={exportProgress ? null : exportXLSX} disabled={!!exportProgress}><Download size={13} /> Excel</button>
        </div>
      </div>

      {/* Export progress bar */}
      {exportProgress && (
        <div style={{ margin: '0 0 12px 0', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#166534' }}>
              {exportProgress.finished
                ? `✓ ${exportProgress.type} downloaded — ${exportProgress.done.toLocaleString()} rows`
                : `Downloading ${exportProgress.type}… ${exportProgress.done.toLocaleString()} rows fetched`}
            </span>
            <span style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>
              {exportProgress.finished ? '100%' : ''}
            </span>
          </div>
          <div style={{ height: 6, background: '#D1FAE5', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#16A34A', borderRadius: 99, width: exportProgress.finished ? '100%' : `${Math.min(90, 10 + (exportProgress.done / 2000))}%`, transition: 'width 0.4s ease' }} />
          </div>
        </div>
      )}

      {/* Upload progress bar */}
      {uploadProgress && (
        <div style={{ margin: '0 0 12px 0', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1E40AF' }}>
              {uploadProgress.finished
                ? `✓ Upload complete — ${uploadProgress.total.toLocaleString()} rows saved`
                : uploadProgress.parsing
                ? `⏳ Parsing file… please wait`
                : `⬆ Uploading… ${uploadProgress.done.toLocaleString()} / ${uploadProgress.total.toLocaleString()} rows inserted`}
            </span>
            <span style={{ fontSize: 13, color: '#1E40AF', fontWeight: 800 }}>
              {uploadProgress.finished ? '100%' : uploadProgress.parsing || !uploadProgress.total ? '' : `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%`}
            </span>
          </div>
          <div style={{ height: 8, background: '#DBEAFE', borderRadius: 99, overflow: 'hidden' }}>
            {uploadProgress.parsing ? (
              <div style={{ height: '100%', width: '30%', background: 'linear-gradient(90deg, #2563EB 0%, #60A5FA 50%, #2563EB 100%)', backgroundSize: '200% 100%', borderRadius: 99, animation: 'shimmer 1.2s infinite linear' }} />
            ) : (
              <div style={{ height: '100%', background: '#2563EB', borderRadius: 99, width: uploadProgress.total ? `${(uploadProgress.done / uploadProgress.total) * 100}%` : '0%', transition: 'width 0.3s ease' }} />
            )}
          </div>
          {!uploadProgress.parsing && !uploadProgress.finished && uploadProgress.total > 0 && (
            <div style={{ fontSize: 11, color: '#3B82F6', marginTop: 4 }}>
              {(uploadProgress.total - uploadProgress.done).toLocaleString()} rows remaining…
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>

      {/* Format tabs (a standalone page shows only its table name) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 14, minHeight: only ? 24 : undefined }}>
        {!only && Object.values(FORMATS).filter((f) => !f.parent && !f.standalone).map((f) => {
          const Ico = f.icon; const active = f.key === tab || FORMATS[tab]?.parent === f.key;
          return (
            <button key={f.key} onClick={() => setTab(f.key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', borderBottom: `2px solid ${active ? C.accent : 'transparent'}`, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: active ? C.accent : C.t2, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Ico size={14} /> {f.label}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: C.t3, fontFamily: 'monospace', paddingBottom: 8 }}>{fmt.table}</span>
      </div>

      {/* Sub-views of the active ledger. FTL/PTL carries two: the per-trip freight
          ledger, and vehicles on a standing monthly charge. Kept apart because a
          rental has one location rather than a lane and no trips to divide by, so its
          cost must never enter the per-trip or per-lane freight figures. */}
      {(() => {
        const parentKey = FORMATS[tab]?.parent || tab
        const views = Object.values(FORMATS).filter((f) => f.key === parentKey || f.parent === parentKey)
        if (views.length < 2) return null
        return (
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {views.map((v) => {
              const on = v.key === tab
              return (
                <button key={v.key} onClick={() => setTab(v.key)}
                  className={`tool-btn${on ? " is-active" : ""}`} aria-pressed={on}>
                  {v.parent ? "Rental Fixed Vehicle" : "Freight (per trip)"}
                </button>
              )
            })}
          </div>
        )
      })()}

      {/* Upload checklist — which partners' bills are in for this month, and which are not.
          Collapsed to a one-line summary by default: when everything is uploaded there is
          nothing to act on, and the panel should not push the grid down the page. */}
      {fmt.key === 'creditNotes' && <CnSummary C={{ ...C, ach: BASE_C.ach }} months={monthFilter} version={version} />}
      {fmt.key === 'creditNotes' && (
        <>
          <datalist id="cn-category">{CN_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          {CN_CATEGORIES.map((c) => <datalist key={c} id={`cn-reason-${c}`}>{CN_REASONS[c].map((r) => <option key={r} value={r} />)}</datalist>)}
          <datalist id="cn-status"><option value="rejected" /></datalist>
        </>
      )}

      {(() => {
        const cov = coverage[tab];
        if (!cov?.length) return null;

        const allMonths = [...new Set(cov.map((r) => r.month_year))].sort();
        const cell = new Map(cov.map((r) => [`${r.partner}|${r.month_year}`, r]));

        // A gap only counts BETWEEN a partner's first and last month. Before the first it
        // had not been onboarded and after the last we may have stopped using it — marking
        // either as missing would bury the real holes under months nobody expected a bill
        // for. Shadowfax billed Feb-Jun and Aug, so July is a genuine hole; its January is
        // not.
        const partners = [...new Set(cov.map((r) => r.partner))].map((p) => {
          const mine = allMonths.filter((m) => cell.has(`${p}|${m}`));
          const first = mine[0], last = mine[mine.length - 1];
          const span = allMonths.filter((m) => m >= first && m <= last);
          return { partner: p, first, last, gaps: span.filter((m) => !cell.has(`${p}|${m}`)) };
        }).sort((a, b) => b.gaps.length - a.gaps.length || a.partner.localeCompare(b.partner));

        const totalGaps = partners.reduce((n, p) => n + p.gaps.length, 0);
        const allIn = totalGaps === 0;
        return (
          <div style={{ marginBottom: 12, border: `1px solid ${allIn ? '#BBF7D0' : '#FDE68A'}`, borderRadius: 10, background: allIn ? '#F0FDF4' : '#FFFBEB', overflow: 'hidden' }}>
            <button
              onClick={() => setCoverageOpen((o) => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: allIn ? C.green : '#92400E', textAlign: 'left' }}
            >
              <span style={{ fontWeight: 700 }}>
                {allIn
                  ? `No upload gaps · ${partners.length} partners × ${allMonths.length} months`
                  : `${totalGaps} missing upload${totalGaps === 1 ? '' : 's'} across ${partners.filter((p) => p.gaps.length).length} partner${partners.filter((p) => p.gaps.length).length === 1 ? '' : 's'}`}
              </span>
              {!allIn && (
                <span style={{ fontWeight: 500, opacity: .85 }}>
                  — {partners.filter((p) => p.gaps.length).map((p) => `${p.partner} (${p.gaps.join(', ')})`).join('; ')}
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 10, opacity: .7 }}>{coverageOpen ? '▲' : '▼'}</span>
            </button>
            {coverageOpen && (
              <div style={{ padding: '0 12px 12px', overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 11.5, fontFamily: 'inherit' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '4px 10px 6px 0', fontWeight: 600, color: C.t3, position: 'sticky', left: 0, background: allIn ? '#F0FDF4' : '#FFFBEB' }}>Partner</th>
                      {allMonths.map((m) => (
                        <th key={m} style={{ padding: '4px 8px 6px', fontWeight: 600, color: C.t3, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {partners.map((p) => (
                      <tr key={p.partner}>
                        <td style={{ padding: '3px 10px 3px 0', whiteSpace: 'nowrap', fontWeight: p.gaps.length ? 700 : 500, color: p.gaps.length ? '#92400E' : C.t2, position: 'sticky', left: 0, background: allIn ? '#F0FDF4' : '#FFFBEB' }}>
                          {p.partner}
                        </td>
                        {allMonths.map((m) => {
                          const c = cell.get(`${p.partner}|${m}`);
                          // Three states, deliberately distinct: a line count means the
                          // bill is in, a dash means a month this partner was not active
                          // in, and "missing" is a hole inside its active span — the only
                          // one that needs chasing.
                          const outside = m < p.first || m > p.last;
                          return (
                            <td key={m}
                              title={c ? `${c.rows_n.toLocaleString('en-IN')} lines · ₹${money(c.cost)}`
                                : outside ? `Not billing in ${m}` : `No bill uploaded for ${m}`}
                              style={{
                                padding: '3px 8px', textAlign: 'right', fontFamily: 'monospace',
                                whiteSpace: 'nowrap',
                                color: c ? C.t2 : outside ? '#D1D5DB' : '#B45309',
                                background: !c && !outside ? '#FEF3C7' : 'transparent',
                                fontWeight: !c && !outside ? 700 : 400,
                                borderRadius: 4,
                              }}>
                              {c ? c.rows_n.toLocaleString('en-IN') : outside ? '·' : 'missing'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>
                  Counts are invoice lines uploaded. <strong>missing</strong> is a month with no bill between a partner's first and last upload; <span style={{ color: '#D1D5DB', fontWeight: 700 }}>·</span> is a month it was not billing in.
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button style={chipBtn} onClick={addRow}><Plus size={13} /> {fmt.addLabel ?? 'Add invoice line'}</button>
        <button style={{ ...chipBtn, ...(unsaved ? chipHot : {}) }} onClick={saveAll} disabled={busy}><Save size={13} /> Save{unsaved ? ` (${unsaved})` : ''}</button>
        <button style={chipBtn} onClick={() => load(tab, singleMonth)} disabled={busy}><RefreshCw size={13} /> Reload</button>
        <span style={{ fontSize: 11, color: C.t3, fontFamily: 'monospace', marginLeft: 4 }}>
          {totals.count} line{totals.count !== 1 ? 's' : ''} · ₹{money(totals.amount)}{monthFilter || query ? ' (filtered)' : ''}
        </span>
      </div>

      {/* Status banner */}
      {status && (
        <div style={{ fontSize: 12.5, padding: '8px 12px', borderRadius: 8, marginBottom: 10, border: `1px solid ${status.kind === 'error' ? '#FCA5A5' : '#BBF7D0'}`, background: status.kind === 'error' ? '#FEF2F2' : '#F0FDF4', color: status.kind === 'error' ? C.red : C.green }}>
          {status.text}
        </div>
      )}

      {/* Table */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'auto', background: C.card, maxHeight: '62vh' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12.5 }}>
          <thead>
            <tr>
              {fmt.fields.map((f, i) => (
                <th key={f.key} style={{ position: 'sticky', top: 0, zIndex: i === 0 ? 3 : 2, left: i === 0 ? 0 : undefined, background: C.ach, textAlign: f.type === 'num' || f.type === 'int' ? 'right' : 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', minWidth: f.w }}
                  title={[f.desc, f.req ? 'Mandatory.' : 'Optional.', f.computed ? 'Auto-computed.' : null].filter(Boolean).join(' ')}>
                  {f.label}{f.req && <span style={{ color: C.red }}> *</span>}{f.computed && <span style={{ color: C.t3 }}> ƒ</span>}
                </th>
              ))}
              <th style={{ position: 'sticky', top: 0, zIndex: 2, background: C.ach, width: 40, borderBottom: `1px solid ${C.border}` }} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={fmt.fields.length + 1} style={{ padding: '32px 16px', textAlign: 'center', color: C.t3, fontSize: 13 }}>
                {busy ? 'Loading…' : rows.length === 0 ? 'No invoice lines yet. Download the template, fill it in, and upload — or add a line manually.' : 'No lines match your filter.'}
              </td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r._uid} style={{ borderBottom: `1px solid #F0ECE3` }}
                onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = C.hov)}
                onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = C.card)}>
                {fmt.fields.map((f, i) => {
                  const isTotal = f.key === fmt.totalField;
                  const derived = isTotal && !isTotalOverridden(fmt, r);
                  const shown = derived ? effectiveTotal(fmt, r) : r[f.key] ?? "";
                  const dupCell = keyFields(fmt).includes(f.key) && isDup(r);
                  return (
                    <td key={f.key} style={{ padding: 0, background: C.card, position: i === 0 ? 'sticky' : undefined, left: i === 0 ? 0 : undefined, zIndex: i === 0 ? 1 : undefined }}>
                      <input
                        list={f.list?.(r)}
                        value={derived ? (shown === "" ? "" : String(shown)) : shown}
                        placeholder={derived ? "auto" : f.type === "num" ? "0.00" : f.label}
                        inputMode={f.type === "num" || f.type === "int" ? "decimal" : undefined}
                        onChange={(e) => setCell(r._uid, f.key, e.target.value)}
                        onBlur={() => commitCell(r._uid)}
                        style={{ width: '100%', border: 'none', background: dupCell ? '#FEF2F2' : 'transparent', padding: '10px 12px', fontSize: 12.5, color: dupCell ? C.red : derived ? C.t3 : C.t1, fontFamily: derived || f.type === 'num' || f.type === 'int' ? 'monospace' : 'inherit', textAlign: f.type === 'num' || f.type === 'int' ? 'right' : 'left', fontStyle: derived ? 'italic' : 'normal', outline: 'none' }}
                        title={dupCell ? `Duplicate ${f.label}` : derived ? "Computed — type to override" : undefined}
                      />
                    </td>
                  );
                })}
                <td style={{ padding: '0 4px', textAlign: 'center', background: C.card }}>
                  <button onClick={() => deleteRow(r._uid)} style={{ background: 'transparent', border: 'none', color: C.red, cursor: 'pointer', padding: 5, borderRadius: 5, display: 'inline-flex' }}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <p style={{ fontSize: 11.5, color: C.t3, marginTop: 12, lineHeight: 1.6 }}>
        <strong style={{ color: C.t2 }}>{fmt.label}</strong> ·{' '}
        {fmt.uniqueKey ? <>One row per <strong style={{ color: C.t2 }}>{keyLabel(fmt)}</strong>. Re-uploading an existing one <strong style={{ color: C.t2 }}>replaces</strong> that row.</> : <>One row per invoice line, appended — uploads never overwrite.</>}{' '}
        {fmt.key === 'creditNotes'
          ? <>Amounts are ex-GST. Status is set from the amounts unless marked <em>rejected</em>.</>
          : fmt.totalParts.length > 0
          ? <><span style={{ color: C.t3 }}>ƒ</span> Total Cost is computed from {fmt.totalParts.length} charge components when left blank; typing a value overrides it.</>
          : <>Cost is the standing monthly charge, entered directly.</>}
      </p>
    </div>
  );
}
