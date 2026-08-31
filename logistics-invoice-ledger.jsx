import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  Plus, Trash2, Download, Search, FileSpreadsheet, Upload,
  Truck, Package, RefreshCw, Save, AlertCircle,
} from "lucide-react";

// ── Logistics Bill Invoice Ledger ───────────────────────────────────────────
// Transactional ledger: one row per invoice line. Two bill formats (B2B
// freight / B2C courier), each with its own columns, template and Supabase
// table. Both run through a single config-driven code path below.
//
// Storage: Supabase. See the DATA LAYER section — every DB call lives there.

// ── SCHEMA CONFIG ───────────────────────────────────────────────────────────
// One entry per format. `fields` order is the template column order and the
// grid column order. type drives cell alignment + numeric coercion on export.
//   req: true       → mandatory (red header, row skipped on upload if blank)
//   computed: true  → derived total; uploaded/typed value always wins

const FORMATS = {
  b2b: {
    key: "b2b",
    label: "B2B · Freight",
    icon: Truck,
    table: "logistics_invoices_b2b",
    templateFile: "b2b_courier_invoice_template.xlsx",
    exportPrefix: "b2b_freight_invoices",
    // components summed into the computed total
    totalParts: ["freight_charge", "surcharge", "other_charge", "toll_charge"],
    totalField: "total_cost",
    uniqueKey: null, // B2B freight bills have no natural unique line key — always append
    // order, labels, mandatory flags and descriptions all mirror the
    // `instruction` sheet of b2bcourierinvoiceuploadertemplate.xlsx
    fields: [
      { key: "month_year", label: "month_year", type: "month", req: true, w: 110, ex: "2026-07",
        desc: "Billing period this invoice covers (e.g., the month the invoice was raised for)" },
      { key: "invoice_number", label: "invoice_number", type: "text", w: 150, ex: "TRN-INV-3321",
        desc: "Transporter's invoice/bill number, as printed on their invoice" },
      { key: "transporter_name", label: "transporter_name", type: "text", req: true, w: 170, ex: "ABC Roadlines",
        desc: "Name of the B2B transporter" },
      { key: "reference_no", label: "reference_no", type: "text", req: true, w: 140, ex: "LR-778812",
        desc: "LR (Lorry Receipt) number or equivalent trip/consignment reference — used to match this invoice line back to our trip records" },
      { key: "origin_location", label: "origin_location", type: "text", req: true, w: 150, ex: "Bhiwandi WH",
        desc: "Warehouse/city the goods were dispatched from" },
      { key: "destination_location", label: "destination_location", type: "text", req: true, w: 170, ex: "Pune WH",
        desc: "Warehouse/city the goods were delivered to" },
      { key: "vehicle_number", label: "vehicle_number", type: "text", w: 140, ex: "MH12AB1234",
        desc: "Registration number of the vehicle used for this trip" },
      { key: "vehicle_type", label: "vehicle_type", type: "text", w: 130, ex: "Eicher 14ft",
        desc: "Type/size of vehicle used (e.g., Tata Ace, Eicher 14ft, 32ft container)" },
      { key: "freight_type_FTL_PTL", label: "freight_type_FTL_PTL", type: "text", w: 165, ex: "PTL",
        desc: "Whether this was a full truck load or part truck load booking — FTL / PTL" },
      { key: "no_of_packages", label: "no_of_packages", type: "int", w: 130, ex: "120",
        desc: "Number of packages/cartons in this consignment" },
      { key: "load_weight", label: "load_weight", type: "num", w: 120, ex: "2800",
        desc: "Actual weight of goods loaded onto the vehicle" },
      { key: "charged_weight", label: "charged_weight", type: "num", req: true, w: 135, ex: "2850",
        desc: "Weight the transporter actually billed on (may differ from load_weight)" },
      { key: "freight_charge", label: "freight_charge", type: "num", req: true, w: 130, ex: "9500",
        desc: "Base freight charge billed by the transporter" },
      { key: "surcharge", label: "surcharge", type: "num", req: true, w: 110, ex: "650",
        desc: "Fuel surcharge or similar add-on charge" },
      { key: "other_charge", label: "other_charge", type: "num", w: 120, ex: "300",
        desc: "Loading/unloading/detention or other charges not listed separately — specify in remarks" },
      { key: "toll_charge", label: "toll_charge", type: "num", w: 110, ex: "200",
        desc: "Toll charges billed separately, if applicable" },
      { key: "total_cost", label: "total_cost", type: "num", req: true, computed: true, w: 120, ex: "10650",
        desc: "Grand total invoiced for this trip (should equal freight_charge + surcharge + other_charge + toll_charge, plus GST if applicable)" },
      { key: "remarks", label: "remarks", type: "text", w: 200, ex: "Standard route, no dispute",
        desc: "Any free-text note — e.g., what's included in other_charge, or dispute-related notes" },
    ],
    // columns scanned by the search box
    searchKeys: ["invoice_number", "transporter_name", "reference_no", "vehicle_number", "origin_location", "destination_location"],
    notes: [
      "One row = one freight bill line. Upload APPENDS rows — nothing is overwritten or de-duplicated.",
      "month_year must be YYYY-MM (e.g. 2026-07). Excel date cells and 2026/07 are also accepted.",
      "total_cost is computed as freight_charge + surcharge + other_charge + toll_charge when left blank. Fill it in to override.",
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
    // AWB is the unique line key: re-uploading an AWB replaces its row wholesale
    // (latest upload wins). Requires a UNIQUE constraint on awb_number in Supabase.
    uniqueKey: "awb_number",
    // order, labels, mandatory flags and descriptions all mirror the
    // `instruction` sheet of b2ccourierinvoiceuploadertemplate.xlsx
    fields: [
      { key: "month_year", label: "month_year", type: "month", req: true, w: 110, ex: "2026-07",
        desc: "Billing period this invoice covers (e.g., the month the invoice was raised for)" },
      { key: "invoice_number", label: "invoice_number", type: "text", w: 155, ex: "INV-DLV-0072451",
        desc: "Courier's invoice/bill number, as printed on their invoice" },
      { key: "courier_name", label: "courier_name", type: "text", req: true, w: 140, ex: "Delhivery",
        desc: "Name of the B2C courier partner (Delhivery, Bluedart, Ecom Express, etc.)" },
      { key: "courier_account_type", label: "courier_account_type", type: "text", req: true, w: 175, ex: "Surface",
        desc: "Type of account/service this shipment was billed under (e.g. Surface, Air, Express, SDD/NDD)" },
      { key: "awb_number", label: "awb_number", type: "text", req: true, w: 150, ex: "1234567890123",
        desc: "Airway Bill number — the unique shipment identifier, used to match this invoice line back to our shipment records" },
      { key: "shipment_value", label: "shipment_value", type: "num", req: true, w: 130, ex: "1499",
        desc: "Declared order/shipment value (used for COD or insurance reference)" },
      { key: "shipment_date", label: "shipment_date", type: "date", w: 130, ex: "2026-07-05",
        desc: "Date the shipment was picked up/dispatched" },
      { key: "order_id", label: "order_id", type: "text", w: 130, ex: "ORD-88213",
        desc: "Our internal order ID, if carried on the courier's invoice" },
      { key: "payment_mode", label: "payment_mode", type: "text", req: true, w: 130, ex: "Prepaid",
        desc: "Payment status of this invoice line from our side — Prepaid/COD" },
      { key: "shipment_mode", label: "shipment_mode", type: "text", req: true, w: 135, ex: "Forward",
        desc: "Direction of shipment movement — Forward / RTO / Reverse" },
      { key: "origin_pincode", label: "origin_pincode", type: "text", w: 130, ex: "411001",
        desc: "Pincode the shipment was sent from" },
      { key: "origin_city", label: "origin_city", type: "text", w: 120, ex: "Pune",
        desc: "City the shipment was sent from" },
      { key: "destination_pincode", label: "destination_pincode", type: "text", w: 165, ex: "560001",
        desc: "Pincode the shipment was delivered to" },
      { key: "destination_city", label: "destination_city", type: "text", w: 145, ex: "Bengaluru",
        desc: "City the shipment was delivered to" },
      { key: "zone", label: "zone", type: "text", req: true, w: 80, ex: "B",
        desc: "Courier's own zone classification for this shipment (used for rate-card/zone-based cost matching)" },
      { key: "product", label: "product", type: "text", req: true, w: 175, ex: "Neck Pillow - Grey",
        desc: "Product/SKU shipped in this consignment" },
      { key: "qty", label: "qty", type: "int", req: true, w: 80, ex: "1",
        desc: "Quantity of the product shipped in this consignment" },
      { key: "charged_weight_courier", label: "charged_weight_courier", type: "num", req: true, w: 185, ex: "0.65",
        desc: "Weight the courier actually billed on (chargeable or volumetric weight, whichever is higher)" },
      { key: "declared_weight_frido", label: "declared_weight_frido", type: "num", w: 180, ex: "0.55",
        desc: "Our own recorded/declared weight for this shipment, for comparison against the courier's charged weight" },
      { key: "freight_charge", label: "freight_charge", type: "num", req: true, w: 130, ex: "62.50",
        desc: "Base freight/forward charge billed by the courier" },
      { key: "surcharge", label: "surcharge", type: "num", req: true, w: 110, ex: "8.30",
        desc: "Fuel surcharge or similar add-on charge" },
      { key: "other_charge", label: "other_charge", type: "num", w: 120, ex: "5",
        desc: "Any other charge not covered above (e.g., COD fee, appointment fee, handling charge) — specify in remarks" },
      { key: "total_cost", label: "total_cost", type: "num", req: true, computed: true, w: 120, ex: "84.20",
        desc: "Grand total invoiced for this shipment (should equal freight_charge + surcharge + other_charge, plus GST if applicable)" },
      { key: "remarks", label: "remarks", type: "text", w: 200, ex: "Standard forward shipment, no dispute",
        desc: "Any free-text note — e.g., what's included in other_charge, or dispute-related notes" },
    ],
    searchKeys: ["invoice_number", "courier_name", "awb_number", "order_id", "destination_city", "origin_city", "zone", "product"],
    notes: [
      "awb_number is the unique key. One row = one AWB. Re-uploading an AWB that already exists REPLACES its stored row with the new data — duplicates are never created.",
      "If the same AWB appears twice inside one file, the LAST occurrence wins.",
      "month_year must be YYYY-MM (e.g. 2026-07). shipment_date should be YYYY-MM-DD.",
      "total_cost is computed as freight_charge + surcharge + other_charge when left blank. Fill it in to override.",
      "payment_mode expects Prepaid or COD. shipment_mode expects Forward, RTO or Reverse.",
    ],
  },
};

// ── DATA LAYER ──────────────────────────────────────────────────────────────
// All Supabase access is confined to this block. Provide a client via
//   window.__supabase = createClient(URL, ANON_KEY)
// or swap `getClient` for a direct import of your app's shared client.
// With no client present the app runs fully in-memory (local demo mode) so the
// UI, template and export are all usable before the tables exist.

const getClient = () =>
  (typeof window !== "undefined" && window.__supabase) || null;

// row id column in Supabase; used for update/delete targeting
const PK = "id";

const db = {
  get enabled() {
    return !!getClient();
  },

  async fetchRows(fmt) {
    const sb = getClient();
    if (!sb) return null; // local mode
    const { data, error } = await sb
      .from(fmt.table)
      .select("*")
      .order("month_year", { ascending: false })
      .order(PK, { ascending: false })
      .limit(5000);
    if (error) throw error;
    return data ?? [];
  },

  // Bulk write; returns the written rows (with server-assigned ids).
  // Formats with a uniqueKey UPSERT on it — an existing row with the same key
  // is replaced by the incoming one (latest upload wins). Formats without one
  // plain-insert (append).
  async insertRows(fmt, rows) {
    const sb = getClient();
    if (!sb) return rows;
    const payload = rows.map((r) => toDbRow(fmt, r));
    const out = [];
    // chunk so a large upload doesn't exceed the request size limit
    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const q = fmt.uniqueKey
        ? sb.from(fmt.table).upsert(chunk, {
            onConflict: fmt.uniqueKey,
            ignoreDuplicates: false, // replace, don't skip
          })
        : sb.from(fmt.table).insert(chunk);
      const { data, error } = await q.select();
      if (error) throw error;
      out.push(...(data ?? []));
    }
    return out;
  },

  async updateRow(fmt, row) {
    const sb = getClient();
    if (!sb || !row[PK]) return;
    const { error } = await sb
      .from(fmt.table)
      .update(toDbRow(fmt, row))
      .eq(PK, row[PK]);
    if (error) throw error;
  },

  async deleteRow(fmt, row) {
    const sb = getClient();
    if (!sb || !row[PK]) return;
    const { error } = await sb.from(fmt.table).delete().eq(PK, row[PK]);
    if (error) throw error;
  },
};

// grid row (all strings, plus client-only _uid) → DB row (typed, nulls)
const toDbRow = (fmt, r) => {
  const out = {};
  for (const f of fmt.fields) {
    const v = r[f.key];
    if (v === "" || v == null) {
      out[f.key] = null;
      continue;
    }
    if (f.type === "num" || f.type === "int") {
      const n = Number(v);
      out[f.key] = Number.isFinite(n) ? n : null;
    } else {
      out[f.key] = String(v);
    }
  }
  // persist the computed total so downstream SQL doesn't have to re-derive it
  out[fmt.totalField] = numOrNull(effectiveTotal(fmt, r));
  // carry the PK only when the row already exists, so an upsert of a new row
  // doesn't try to write a null id
  if (r[PK]) out[PK] = r[PK];
  return out;
};

// DB row → grid row (everything a string so inputs stay controlled)
const fromDbRow = (fmt, d) => {
  const r = { _uid: uid(), [PK]: d[PK] ?? null };
  for (const f of fmt.fields) r[f.key] = d[f.key] == null ? "" : String(d[f.key]);
  return r;
};

// ── HELPERS ─────────────────────────────────────────────────────────────────

// second worked example per format, keyed by field — mirrors row 3 of the
// source templates. Fields absent here fall back to blank on the second row.
const SAMPLE2 = {
  b2b: {
    month_year: "2026-07", invoice_number: "TRN-INV-3355", transporter_name: "XYZ Logistics",
    reference_no: "LR-778950", origin_location: "Pune WH", destination_location: "Bhiwandi WH",
    vehicle_number: "MH14CD5678", vehicle_type: "32ft SXL", freight_type_FTL_PTL: "FTL",
    no_of_packages: "480", load_weight: "9200", charged_weight: "9200",
    freight_charge: "28000", surcharge: "1900", other_charge: "1200", toll_charge: "450",
    total_cost: "31550",
    remarks: "Detention charge of Rs 1200 included in other_charge due to 6hr delay at destination",
  },
  b2c: {
    month_year: "2026-07", invoice_number: "INV-DLV-0072498", courier_name: "Bluedart",
    courier_account_type: "Express", awb_number: "9988776655443", shipment_value: "2299",
    shipment_date: "2026-07-12", order_id: "ORD-88340", payment_mode: "COD",
    shipment_mode: "RTO", origin_pincode: "560001", origin_city: "Bengaluru",
    destination_pincode: "411001", destination_city: "Pune", zone: "C",
    product: "Lumbar Support Cushion", qty: "2", charged_weight_courier: "1.10",
    declared_weight_frido: "1", freight_charge: "95", surcharge: "12", other_charge: "20",
    total_cost: "152",
    remarks: "RTO due to customer refusal; COD charge included in other_charge",
  },
};

const uid = () => Math.random().toString(36).slice(2, 10);
const todayMonth = () => new Date().toISOString().slice(0, 7);
const todayDate = () => new Date().toISOString().slice(0, 10);

const num = (v) => {
  if (v === "" || v == null) return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
// real number for export when it parses cleanly, else the raw text
const numOrRaw = (v) => {
  if (v === "" || v == null) return "";
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
};

const sumParts = (fmt, r) => fmt.totalParts.reduce((s, k) => s + num(r[k]), 0);

// an explicit total always wins; otherwise derive from the components
const effectiveTotal = (fmt, r) => {
  const explicit = r[fmt.totalField];
  if (explicit !== "" && explicit != null) {
    const n = Number(explicit);
    if (Number.isFinite(n)) return n;
  }
  const parts = sumParts(fmt, r);
  return parts === 0 ? "" : parts;
};

const isTotalOverridden = (fmt, r) =>
  r[fmt.totalField] !== "" && r[fmt.totalField] != null;

const money = (v) =>
  v === "" || v == null
    ? ""
    : Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const blankRow = (fmt) => {
  const r = { _uid: uid(), [PK]: null };
  for (const f of fmt.fields) r[f.key] = "";
  r.month_year = todayMonth();
  return r;
};

// normalize any month-ish input (YYYY-MM, YYYY/MM, Excel serial, Date) → YYYY-MM
const normMonth = (v) => {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 7);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, "0")}`;
  if (/^\d{4,6}$/.test(s)) {
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(+s) : null;
    if (d && d.y) return `${d.y}-${String(d.m).padStart(2, "0")}`;
  }
  const d2 = new Date(s);
  if (!isNaN(d2)) return d2.toISOString().slice(0, 7);
  return null;
};

// normalize a date-ish input → YYYY-MM-DD (blank passes through)
const normDate = (v) => {
  if (v == null || v === "") return "";
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // 04/08/2026
  if (dmy) return `${dmy[3]}-${String(+dmy[2]).padStart(2, "0")}-${String(+dmy[1]).padStart(2, "0")}`;
  if (/^\d{4,6}$/.test(s)) {
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(+s) : null;
    if (d && d.y)
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const d2 = new Date(s);
  return isNaN(d2) ? s : d2.toISOString().slice(0, 10);
};

// header cell → comparable key: lowercase, drop the (Mandatory)/(Optional)
// tag, collapse spaces/underscores so "AWB Number" == "awb_number"
const normHead = (c) =>
  String(c ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\((mandatory|optional|required|computed|auto)\)\s*$/i, "")
    .replace(/[\s_]+/g, " ")
    .trim();

const headKey = (f) => normHead(f.label);

// ── COMPONENT ───────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState("b2b");
  const fmt = FORMATS[tab];

  // rows are kept per format so switching tabs doesn't lose unsaved edits
  const [store, setStore] = useState({ b2b: null, b2c: null });
  const [query, setQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { kind, text }
  const fileInput = useRef(null);

  const rows = store[tab] ?? [];
  const setRows = useCallback(
    (fn) =>
      setStore((s) => ({ ...s, [tab]: typeof fn === "function" ? fn(s[tab] ?? []) : fn })),
    [tab]
  );

  const flash = (kind, text) => {
    setStatus({ kind, text });
    if (kind !== "error") setTimeout(() => setStatus(null), 4000);
  };

  // ── load from Supabase (or seed one blank row in local mode) ──
  const load = useCallback(
    async (which) => {
      const f = FORMATS[which];
      setBusy(true);
      try {
        const data = await db.fetchRows(f);
        setStore((s) => ({
          ...s,
          [which]: data ? data.map((d) => fromDbRow(f, d)) : [blankRow(f)],
        }));
        if (data) flash("ok", `Loaded ${data.length} row${data.length !== 1 ? "s" : ""} from ${f.table}.`);
      } catch (e) {
        setStore((s) => ({ ...s, [which]: s[which] ?? [blankRow(f)] }));
        flash("error", `Couldn't load ${f.table}: ${e.message ?? e}`);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  // load a tab's data the first time it's opened
  useEffect(() => {
    if (store[tab] == null) load(tab);
  }, [tab, store, load]);

  const months = useMemo(
    () => Array.from(new Set(rows.map((r) => r.month_year).filter(Boolean))).sort().reverse(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (monthFilter && r.month_year !== monthFilter) return false;
      if (!q) return true;
      return fmt.searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q));
    });
  }, [rows, query, monthFilter, fmt]);

  // unique-key values appearing on more than one grid row — flagged inline so a
  // manual entry can't silently collide before it reaches Supabase
  const dupKeys = useMemo(() => {
    if (!fmt.uniqueKey) return new Set();
    const seen = new Map();
    for (const r of rows) {
      const v = String(r[fmt.uniqueKey] ?? "").trim().toLowerCase();
      if (!v) continue;
      seen.set(v, (seen.get(v) ?? 0) + 1);
    }
    return new Set(Array.from(seen).filter(([, n]) => n > 1).map(([v]) => v));
  }, [rows, fmt]);

  const isDup = (r) =>
    !!fmt.uniqueKey &&
    dupKeys.has(String(r[fmt.uniqueKey] ?? "").trim().toLowerCase());

  const totals = useMemo(() => {
    let amount = 0;
    for (const r of filtered) amount += num(effectiveTotal(fmt, r));
    return { count: filtered.length, amount };
  }, [filtered, fmt]);

  // ── editing ──
  const setCell = (rid, key, val) =>
    setRows((rs) => rs.map((r) => (r._uid === rid ? { ...r, [key]: val, _dirty: true } : r)));

  const commitCell = async (rid) => {
    const row = rows.find((r) => r._uid === rid);
    if (!row || !row._dirty || !row[PK] || !db.enabled) return;
    try {
      await db.updateRow(fmt, row);
      setRows((rs) => rs.map((r) => (r._uid === rid ? { ...r, _dirty: false } : r)));
    } catch (e) {
      flash("error", `Save failed: ${e.message ?? e}`);
    }
  };

  const addRow = () => setRows((rs) => [blankRow(fmt), ...rs]);

  const deleteRow = async (rid) => {
    const row = rows.find((r) => r._uid === rid);
    if (!row) return;
    if (row[PK] && !confirm(`Delete invoice ${row.invoice_number || "(blank)"}? This removes it from Supabase.`))
      return;
    setRows((rs) => rs.filter((r) => r._uid !== rid));
    try {
      await db.deleteRow(fmt, row);
    } catch (e) {
      flash("error", `Delete failed: ${e.message ?? e}`);
    }
  };

  // persist every unsaved row: new rows inserted, edited rows updated
  const saveAll = async () => {
    if (!db.enabled) {
      flash("error", "No Supabase client found. Set window.__supabase to enable saving.");
      return;
    }
    // a duplicate unique key would be rejected by the DB constraint — catch it
    // here with a message that names the offending value
    if (dupKeys.size) {
      const label = fmt.fields.find((f) => f.key === fmt.uniqueKey).label;
      flash(
        "error",
        `Fix duplicate ${label}${dupKeys.size !== 1 ? "s" : ""} before saving: ${Array.from(dupKeys).slice(0, 5).join(", ")}${dupKeys.size > 5 ? "…" : ""}. Each ${label} must appear on one row only.`
      );
      return;
    }
    const fresh = rows.filter((r) => !r[PK] && hasContent(fmt, r));
    const dirty = rows.filter((r) => r[PK] && r._dirty);
    if (!fresh.length && !dirty.length) {
      flash("ok", "Nothing to save — everything is already in Supabase.");
      return;
    }
    setBusy(true);
    try {
      for (const r of dirty) await db.updateRow(fmt, r);
      let inserted = [];
      if (fresh.length) inserted = await db.insertRows(fmt, fresh);
      // map server ids back onto the rows we just inserted, in order
      setRows((rs) => {
        let i = 0;
        return rs.map((r) => {
          if (!r[PK] && hasContent(fmt, r)) {
            const got = inserted[i++];
            return got ? { ...fromDbRow(fmt, got), _uid: r._uid } : { ...r, _dirty: false };
          }
          return r._dirty ? { ...r, _dirty: false } : r;
        });
      });
      flash("ok", `Saved — ${fresh.length} inserted, ${dirty.length} updated.`);
    } catch (e) {
      flash("error", `Save failed: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  // ── template download ──
  const downloadTemplate = () => {
    const green = "1F5C4A";
    const red = "9E2B25";
    const grey = "6B6559";

    // Sheet 1 — billing_data: bare snake_case headers (matching the source
    // templates) plus the two worked sample rows.
    const headerRow = fmt.fields.map((f) => f.label);
    const sampleRows = [0, 1].map((i) =>
      fmt.fields.map((f) => {
        const v = (i === 0 ? f.ex : SAMPLE2[fmt.key]?.[f.key]) ?? "";
        return f.type === "num" || f.type === "int" ? numOrRaw(v) : v;
      })
    );

    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...sampleRows]);
    ws["!cols"] = fmt.fields.map((f) => ({ wch: Math.max(14, f.label.length + 4) }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };

    fmt.fields.forEach((f, c) => {
      const h = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[h])
        ws[h].s = {
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
          fill: { fgColor: { rgb: f.req ? red : green } },
          alignment: { horizontal: "left", vertical: "center" },
        };
      for (const r of [1, 2]) {
        const e = XLSX.utils.encode_cell({ r, c });
        if (ws[e]) ws[e].s = { font: { italic: true, color: { rgb: "9A9382" } } };
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "billing_data");

    // Sheet 2 — instruction: the fields / mandatory-optional / description
    // grid, carried over verbatim from the source template, followed by the
    // upload rules this app enforces.
    const instrRows = fmt.fields.map((f) => [
      f.label,
      f.req ? "mandatory" : "optional",
      f.desc ?? "",
    ]);
    const notes = XLSX.utils.aoa_to_sheet([
      ["fields", "mandatory/optional", "description"],
      ...instrRows,
      [""],
      ["How this file is uploaded"],
      ["1. Keep the header row on the billing_data sheet exactly as-is."],
      ["2. Delete the two grey sample rows, then add your bill lines below the header."],
      ...fmt.notes.map((n, i) => [`${i + 3}. ${n}`]),
      [`${fmt.notes.length + 3}. Any row missing a mandatory field is reported and skipped on upload.`],
    ]);
    notes["!cols"] = [{ wch: 26 }, { wch: 20 }, { wch: 96 }];
    notes["!freeze"] = { xSplit: 0, ySplit: 1 };
    for (let c = 0; c < 3; c++) {
      const a = XLSX.utils.encode_cell({ r: 0, c });
      if (notes[a])
        notes[a].s = {
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
          fill: { fgColor: { rgb: green } },
          alignment: { horizontal: "left", vertical: "center" },
        };
    }
    // colour the mandatory/optional column so the split reads at a glance
    instrRows.forEach((r, i) => {
      const a = XLSX.utils.encode_cell({ r: i + 1, c: 1 });
      if (notes[a])
        notes[a].s = {
          font: { bold: r[1] === "mandatory", color: { rgb: r[1] === "mandatory" ? red : grey } },
        };
      const d = XLSX.utils.encode_cell({ r: i + 1, c: 2 });
      if (notes[d]) notes[d].s = { alignment: { wrapText: true, vertical: "top" } };
    });
    const hdrRow = instrRows.length + 3; // "How this file is uploaded"
    const ha = XLSX.utils.encode_cell({ r: hdrRow, c: 0 });
    if (notes[ha]) notes[ha].s = { font: { bold: true, sz: 12 } };
    XLSX.utils.book_append_sheet(wb, notes, "instruction");

    XLSX.writeFile(wb, fmt.templateFile);
  };

  // ── upload ──
  const importTemplate = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const wb = XLSX.read(reader.result, { type: "array", cellDates: true });
        // prefer the data sheet by name; fall back to the first non-instruction
        // sheet so a hand-made single-sheet file still works
        const dataName =
          wb.SheetNames.find((n) => n.trim().toLowerCase() === "billing_data") ??
          wb.SheetNames.find((n) => !/^instruction/i.test(n.trim())) ??
          wb.SheetNames[0];
        const ws = wb.Sheets[dataName];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
        if (!aoa.length) throw new Error("empty sheet");

        // locate the header row by looking for this format's mandatory labels
        const wanted = fmt.fields.filter((f) => f.req).map(headKey);
        let hIdx = aoa.findIndex((r) => {
          const cells = r.map(normHead);
          return wanted.every((w) => cells.includes(w));
        });

        if (hIdx === -1) {
          // maybe they uploaded the other format's file into this tab
          const other = Object.values(FORMATS).find((o) => o.key !== fmt.key);
          const otherWanted = other.fields.filter((f) => f.req).map(headKey);
          const looksOther = aoa.some((r) => {
            const cells = r.map(normHead);
            return otherWanted.every((w) => cells.includes(w));
          });
          if (looksOther) {
            alert(
              `This looks like a ${other.label} file, but the ${fmt.label} tab is open.\n\n` +
                `Switch to the ${other.label} tab and upload it there.`
            );
            return;
          }
          alert(
            `Couldn't find the header row for ${fmt.label}.\n\n` +
              `Required columns: ${fmt.fields.filter((f) => f.req).map((f) => f.label).join(", ")}.\n\n` +
              `Use 'Download template' and keep its header row intact.`
          );
          return;
        }

        const head = aoa[hIdx].map(normHead);
        const idxOf = {};
        for (const f of fmt.fields) idxOf[f.key] = head.indexOf(headKey(f));

        const body = aoa.slice(hIdx + 1);
        const raw = body.map((r) => {
          const o = {};
          for (const f of fmt.fields) {
            const i = idxOf[f.key];
            let v = i === -1 ? "" : r[i];
            if (f.type === "month") v = normMonth(v) ?? "";
            else if (f.type === "date") v = normDate(v);
            else v = v == null ? "" : String(v).trim();
            o[f.key] = v;
          }
          return o;
        });

        // drop fully blank lines and the two grey sample rows. A sample row is
        // identified by its distinctive reference (AWB / LR number) plus
        // invoice number, so real data can never be mistaken for one.
        const sampleSigs = [
          fmt.fields.reduce((o, f) => ((o[f.key] = f.ex ?? ""), o), {}),
          SAMPLE2[fmt.key] ?? {},
        ];
        const sigKeys = [fmt.uniqueKey ?? "reference_no", "invoice_number"].filter(Boolean);
        const isSample = (r) =>
          sampleSigs.some((sig) =>
            sigKeys.every(
              (k) =>
                String(sig[k] ?? "").trim() !== "" &&
                String(r[k] ?? "").trim().toLowerCase() === String(sig[k]).trim().toLowerCase()
            )
          );
        const candidates = raw.filter(
          (r) => fmt.fields.some((f) => r[f.key] !== "") && !isSample(r)
        );

        // validate mandatory fields
        const bad = [];
        const good = [];
        candidates.forEach((r, i) => {
          const missing = fmt.fields
            .filter((f) => f.req && !f.computed && r[f.key] === "")
            .map((f) => f.label);
          // a computed mandatory total is satisfied by its components
          for (const f of fmt.fields) {
            if (f.req && f.computed && r[f.key] === "" && sumParts(fmt, r) === 0)
              missing.push(f.label);
          }
          if (missing.length) bad.push({ line: hIdx + 2 + i, missing });
          else good.push(r);
        });

        if (bad.length) {
          const preview = bad
            .slice(0, 8)
            .map((b) => `• row ${b.line}: missing ${b.missing.join(", ")}`)
            .join("\n");
          const more = bad.length > 8 ? `\n…and ${bad.length - 8} more.` : "";
          if (
            !confirm(
              `${bad.length} row${bad.length !== 1 ? "s" : ""} will be skipped for missing mandatory fields:\n\n` +
                `${preview}${more}\n\nImport the ${good.length} valid row${good.length !== 1 ? "s" : ""} anyway?`
            )
          ) {
            return;
          }
        }

        if (!good.length) {
          alert("No valid rows found. Add bill lines below the header row and try again.");
          return;
        }

        // ── unique-key handling (B2C: awb_number) ──
        // Within the file, the LAST occurrence of a key wins. Against existing
        // data, the incoming row replaces the stored one.
        let final = good;
        let dupInFile = 0;
        let replacing = [];
        if (fmt.uniqueKey) {
          const byKey = new Map();
          for (const r of good) {
            const k = String(r[fmt.uniqueKey]).trim().toLowerCase();
            if (byKey.has(k)) dupInFile++;
            byKey.set(k, r); // later row overwrites earlier
          }
          final = Array.from(byKey.values());

          const existing = new Map(
            rows
              .filter((r) => String(r[fmt.uniqueKey] ?? "").trim() !== "")
              .map((r) => [String(r[fmt.uniqueKey]).trim().toLowerCase(), r])
          );
          replacing = final.filter((r) =>
            existing.has(String(r[fmt.uniqueKey]).trim().toLowerCase())
          );

          if (replacing.length) {
            const label = fmt.fields.find((f) => f.key === fmt.uniqueKey).label;
            const preview = replacing
              .slice(0, 8)
              .map((r) => `• ${r[fmt.uniqueKey]}`)
              .join("\n");
            const more = replacing.length > 8 ? `\n…and ${replacing.length - 8} more.` : "";
            if (
              !confirm(
                `${replacing.length} ${label}${replacing.length !== 1 ? "s" : ""} already exist and will be ` +
                  `REPLACED with the uploaded data (latest wins):\n\n${preview}${more}\n\n` +
                  `Continue?`
              )
            ) {
              return;
            }
          }

          // carry each existing row's PK so the upsert updates in place
          final = final.map((r) => {
            const hit = existing.get(String(r[fmt.uniqueKey]).trim().toLowerCase());
            return hit && hit[PK] ? { ...r, [PK]: hit[PK] } : r;
          });
        }

        const staged = final.map((r) => ({
          ...r,
          _uid: uid(),
          [PK]: r[PK] ?? null,
          _dirty: true,
        }));

        // merge into the grid: rows sharing a unique key replace the old row
        // in place; everything else is prepended
        const mergeIntoGrid = (rs, incoming) => {
          if (!fmt.uniqueKey) return [...incoming, ...rs];
          const k = (r) => String(r[fmt.uniqueKey] ?? "").trim().toLowerCase();
          const incomingByKey = new Map(incoming.map((r) => [k(r), r]));
          const kept = rs.map((r) => incomingByKey.get(k(r)) ?? r);
          const seen = new Set(rs.map(k));
          const brandNew = incoming.filter((r) => !seen.has(k(r)));
          return [...brandNew, ...kept];
        };

        const summary = (n) => {
          const rep = replacing.length;
          const bits = [`${n - rep} new`, rep ? `${rep} replaced` : null,
            dupInFile ? `${dupInFile} duplicate row${dupInFile !== 1 ? "s" : ""} in file collapsed` : null]
            .filter(Boolean);
          return bits.join(", ");
        };

        if (db.enabled) {
          setBusy(true);
          try {
            const written = await db.insertRows(fmt, staged);
            const asRows = written.map((d) => fromDbRow(fmt, d));
            setRows((rs) => mergeIntoGrid(rs, asRows));
            flash("ok", `Uploaded ${asRows.length} line${asRows.length !== 1 ? "s" : ""} to ${fmt.table} — ${summary(asRows.length)}.`);
          } finally {
            setBusy(false);
          }
        } else {
          setRows((rs) => mergeIntoGrid(rs, staged));
          flash("ok", `Loaded ${staged.length} row${staged.length !== 1 ? "s" : ""} locally — ${summary(staged.length)}. Use Save to persist.`);
        }
      } catch (err) {
        alert(`Couldn't read that file: ${err.message ?? err}\n\nUse the file from 'Download template'.`);
      } finally {
        if (fileInput.current) fileInput.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── export ──
  const exportRows = () =>
    filtered.filter((r) => hasContent(fmt, r));

  const exportCSV = () => {
    const data = exportRows();
    if (!data.length) return alert("Nothing to export — the current view is empty.");
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [fmt.fields.map((f) => esc(f.label)).join(",")];
    for (const r of data) {
      lines.push(
        fmt.fields
          .map((f) => esc(f.key === fmt.totalField ? effectiveTotal(fmt, r) : r[f.key] ?? ""))
          .join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fmt.exportPrefix}_${todayDate()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportXLSX = () => {
    const data = exportRows();
    if (!data.length) return alert("Nothing to export — the current view is empty.");
    const green = "1F5C4A";
    const styleHeader = (ws, n) => {
      for (let c = 0; c < n; c++) {
        const a = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[a])
          ws[a].s = {
            font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
            fill: { fgColor: { rgb: green } },
            alignment: { horizontal: "left", vertical: "center" },
          };
      }
    };

    // Sheet 1 — every invoice line in the current view
    const head = fmt.fields.map((f) => f.label);
    const body = data.map((r) =>
      fmt.fields.map((f) =>
        f.key === fmt.totalField
          ? numOrRaw(effectiveTotal(fmt, r))
          : f.type === "num" || f.type === "int"
          ? numOrRaw(r[f.key])
          : r[f.key] ?? ""
      )
    );
    const wsAll = XLSX.utils.aoa_to_sheet([head, ...body]);
    wsAll["!cols"] = fmt.fields.map((f) => ({ wch: Math.max(12, Math.round(f.w / 8)) }));
    styleHeader(wsAll, head.length);

    // Sheet 2 — month × party summary
    const party = fmt.key === "b2b" ? "transporter_name" : "courier_name";
    const agg = new Map();
    for (const r of data) {
      const k = `${r.month_year}||${r[party] || "(blank)"}`;
      const cur = agg.get(k) ?? { lines: 0, amount: 0 };
      cur.lines += 1;
      cur.amount += num(effectiveTotal(fmt, r));
      agg.set(k, cur);
    }
    const sumHead = ["Month Year", fmt.fields.find((f) => f.key === party).label, "Lines", "Total Cost"];
    const sumBody = Array.from(agg.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([k, v]) => {
        const [m, p] = k.split("||");
        return [m, p, v.lines, Number(v.amount.toFixed(2))];
      });
    const wsSum = XLSX.utils.aoa_to_sheet([sumHead, ...sumBody]);
    wsSum["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 10 }, { wch: 16 }];
    styleHeader(wsSum, sumHead.length);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsAll, "Invoice Lines");
    XLSX.utils.book_append_sheet(wb, wsSum, "Month Summary");
    XLSX.writeFile(wb, `${fmt.exportPrefix}_${todayDate()}.xlsx`);
  };

  const unsaved = rows.filter((r) => (!r[PK] && hasContent(fmt, r)) || r._dirty).length;
  const s = getStyles();
  const TabIcon = fmt.icon;

  return (
    <div style={s.page}>
      <style>{globalCSS}</style>

      <header style={s.header}>
        <div>
          <div style={s.eyebrow}>Invoice-wise · transactional</div>
          <h1 style={s.h1}>Logistics Bill Ledger</h1>
        </div>
        <div style={s.actions}>
          <div style={s.searchWrap}>
            <Search size={15} style={{ opacity: 0.5 }} />
            <input
              style={s.search}
              placeholder="Filter invoices…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select style={s.select} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button style={s.ghostBtn} onClick={downloadTemplate}>
            <FileSpreadsheet size={15} /> Download template
          </button>
          <button style={s.ghostBtn} onClick={() => fileInput.current?.click()} disabled={busy}>
            <Upload size={15} /> Upload filled template
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={importTemplate}
            style={{ display: "none" }}
          />
          <button style={s.ghostBtn} onClick={exportCSV}>
            <Download size={15} /> Export CSV
          </button>
          <button style={s.primaryBtn} onClick={exportXLSX}>
            <Download size={15} /> Export Excel
          </button>
        </div>
      </header>

      <div style={s.tabs}>
        {Object.values(FORMATS).map((f) => {
          const Ico = f.icon;
          const active = f.key === tab;
          return (
            <button
              key={f.key}
              style={{ ...s.tab, ...(active ? s.tabActive : null) }}
              onClick={() => setTab(f.key)}
            >
              <Ico size={15} /> {f.label}
            </button>
          );
        })}
        <span style={s.tableTag}>{fmt.table}</span>
      </div>

      <div style={s.toolbar}>
        <button style={s.chipBtn} onClick={addRow}>
          <Plus size={15} /> Add invoice line
        </button>
        <button
          style={{ ...s.chipBtn, ...(unsaved ? s.chipHot : null) }}
          onClick={saveAll}
          disabled={busy}
        >
          <Save size={15} /> Save {unsaved ? `(${unsaved})` : ""}
        </button>
        <button style={s.chipBtn} onClick={() => load(tab)} disabled={busy}>
          <RefreshCw size={15} /> Reload
        </button>
        <span style={s.count}>
          {totals.count} line{totals.count !== 1 ? "s" : ""} · ₹{money(totals.amount)}
          {monthFilter || query ? " (filtered)" : ""}
        </span>
        {!db.enabled && (
          <span style={s.localTag}>
            <AlertCircle size={13} /> local mode — no Supabase client
          </span>
        )}
      </div>

      {status && (
        <div style={{ ...s.banner, ...(status.kind === "error" ? s.bannerErr : s.bannerOk) }}>
          {status.text}
        </div>
      )}

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {fmt.fields.map((f, i) => (
                <th
                  key={f.key}
                  style={{
                    ...s.th,
                    ...(i === 0 ? s.thSticky : null),
                    ...(f.type === "num" || f.type === "int" ? s.thNum : null),
                    minWidth: f.w,
                  }}
                  title={
                    [
                      f.desc,
                      f.req ? "Mandatory." : "Optional.",
                      f.computed ? "Auto-computed when left blank." : null,
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                >
                  {f.label}
                  {f.req && <span style={{ color: "#C4483A" }}> *</span>}
                  {f.computed && <span style={{ color: "#8A8271" }}> ƒ</span>}
                </th>
              ))}
              <th style={{ ...s.th, width: 44 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={fmt.fields.length + 1} style={s.empty}>
                  {busy
                    ? "Loading…"
                    : rows.length === 0
                    ? "No invoice lines yet. Download the template, fill it in, and upload — or add a line manually."
                    : "No lines match your filter."}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r._uid} className="row">
                {fmt.fields.map((f, i) => {
                  const isTotal = f.key === fmt.totalField;
                  const derived = isTotal && !isTotalOverridden(fmt, r);
                  const shown = derived ? effectiveTotal(fmt, r) : r[f.key] ?? "";
                  const dupCell = f.key === fmt.uniqueKey && isDup(r);
                  return (
                    <td
                      key={f.key}
                      style={{ ...s.td, ...(i === 0 ? s.tdSticky : null) }}
                    >
                      <input
                        style={{
                          ...s.cellInput,
                          ...(f.type === "num" || f.type === "int" ? s.numInput : null),
                          ...(derived ? s.derivedInput : null),
                          ...(dupCell ? s.dupInput : null),
                        }}
                        value={derived ? (shown === "" ? "" : String(shown)) : shown}
                        placeholder={derived ? "auto" : f.type === "num" ? "0.00" : f.label}
                        inputMode={f.type === "num" || f.type === "int" ? "decimal" : undefined}
                        title={
                          dupCell
                            ? `Duplicate ${f.label} — another row in this ledger has the same value. Only one may be saved.`
                            : derived
                            ? "Computed from the charge components — type to override"
                            : undefined
                        }
                        onChange={(e) => setCell(r._uid, f.key, e.target.value)}
                        onBlur={() => commitCell(r._uid)}
                      />
                    </td>
                  );
                })}
                <td style={{ ...s.td, textAlign: "center" }}>
                  <button style={s.delBtn} title="Delete line" onClick={() => deleteRow(r._uid)}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={s.note}>
        <strong>{fmt.label}</strong> ·{" "}
        {fmt.uniqueKey ? (
          <>
            one row per{" "}
            <strong>{fmt.fields.find((f) => f.key === fmt.uniqueKey).label}</strong>, which is unique.
            Re-uploading an existing AWB <strong>replaces</strong> that row with the newer data — no
            duplicates are ever created. Duplicates within a single file collapse to the last
            occurrence.
          </>
        ) : (
          <>one row per invoice line, appended — uploads never overwrite existing rows.</>
        )}{" "}
        <span style={{ color: "#8A8271" }}>ƒ</span> Total Cost is computed from{" "}
        {fmt.totalParts.length} charge components when left blank; typing a value overrides it. Edits
        save on blur; new lines need <em>Save</em>.
      </p>
    </div>
  );
}

// a row worth persisting: any mandatory field filled in
const hasContent = (fmt, r) =>
  fmt.fields.some((f) => f.req && String(r[f.key] ?? "").trim() !== "");

const globalCSS = `
  * { box-sizing: border-box; }
  .row:hover td { background: #FBFAF7 !important; }
  .row:hover td:first-child { background: #F5F2EC !important; }
  input:focus { outline: none; background: #FFFDF6 !important; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  ::placeholder { color: #B9B2A4; }
`;

function getStyles() {
  const ink = "#1C1A16";
  const line = "#E6E1D6";
  const paper = "#FCFBF8";
  const accent = "#1F5C4A"; // deep ledger green
  const accentSoft = "#EAF1EC";
  return {
    page: {
      fontFamily: "'DM Sans', system-ui, sans-serif",
      background: paper,
      color: ink,
      minHeight: "100vh",
      padding: "28px 24px 48px",
    },
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "flex-end",
      flexWrap: "wrap", gap: 16, marginBottom: 18,
    },
    eyebrow: {
      fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.14em",
      textTransform: "uppercase", color: accent, marginBottom: 4,
    },
    h1: {
      fontFamily: "'Fraunces', Georgia, serif", fontSize: 34, fontWeight: 600,
      margin: 0, letterSpacing: "-0.02em",
    },
    actions: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
    searchWrap: {
      display: "flex", alignItems: "center", gap: 7, background: "#fff",
      border: `1px solid ${line}`, borderRadius: 8, padding: "8px 11px",
    },
    search: { border: "none", background: "transparent", fontSize: 14, width: 140, color: ink },
    select: {
      background: "#fff", border: `1px solid ${line}`, borderRadius: 8,
      padding: "9px 11px", fontSize: 14, color: ink, fontFamily: "inherit", cursor: "pointer",
    },
    primaryBtn: {
      display: "inline-flex", alignItems: "center", gap: 7, background: accent,
      color: "#fff", border: "none", padding: "9px 15px", borderRadius: 8,
      fontSize: 14, fontWeight: 500, cursor: "pointer",
    },
    ghostBtn: {
      display: "inline-flex", alignItems: "center", gap: 7, background: "#fff",
      color: ink, border: `1px solid ${line}`, padding: "9px 14px",
      borderRadius: 8, fontSize: 14, cursor: "pointer",
    },
    tabs: {
      display: "flex", alignItems: "center", gap: 4, marginBottom: 16,
      borderBottom: `1px solid ${line}`, paddingBottom: 0,
    },
    tab: {
      display: "inline-flex", alignItems: "center", gap: 7, background: "transparent",
      border: "none", borderBottom: "2px solid transparent", padding: "10px 16px",
      fontSize: 14.5, fontWeight: 500, color: "#8A8271", cursor: "pointer",
      fontFamily: "inherit",
    },
    tabActive: { color: accent, borderBottom: `2px solid ${accent}` },
    tableTag: {
      marginLeft: "auto", fontFamily: "'DM Mono', monospace", fontSize: 11.5,
      color: "#A8A192", paddingBottom: 8,
    },
    toolbar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" },
    chipBtn: {
      display: "inline-flex", alignItems: "center", gap: 6, background: accentSoft,
      color: accent, border: `1px solid ${line}`, padding: "7px 13px",
      borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer",
      fontFamily: "inherit",
    },
    chipHot: { background: "#FBEFE6", color: "#A8541F", borderColor: "#EBD5C2" },
    count: { fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#8A8271", marginLeft: 4 },
    localTag: {
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: "'DM Mono', monospace", fontSize: 11.5, color: "#A8541F",
    },
    banner: {
      fontSize: 13, padding: "9px 13px", borderRadius: 8, marginBottom: 12,
      border: `1px solid ${line}`,
    },
    bannerOk: { background: accentSoft, color: accent, borderColor: "#CFE0D5" },
    bannerErr: { background: "#FBECEA", color: "#9E2B25", borderColor: "#EFD3CF" },
    tableWrap: {
      border: `1px solid ${line}`, borderRadius: 12, overflow: "auto",
      background: "#fff", maxHeight: "66vh",
    },
    table: { borderCollapse: "separate", borderSpacing: 0, width: "100%", fontSize: 14 },
    th: {
      position: "sticky", top: 0, zIndex: 2, background: "#F5F2EC", textAlign: "left",
      padding: "11px 12px", fontWeight: 600, fontSize: 12.5, color: "#5C574B",
      borderBottom: `1px solid ${line}`, whiteSpace: "nowrap",
    },
    thSticky: { left: 0, zIndex: 3 },
    thNum: { textAlign: "right", fontFamily: "'DM Mono', monospace" },
    td: { padding: 0, borderBottom: "1px solid #F0ECE3", background: "#fff" },
    tdSticky: { position: "sticky", left: 0, zIndex: 1, background: "#fff" },
    cellInput: {
      width: "100%", border: "none", background: "transparent", padding: "11px 12px",
      fontSize: 14, color: ink, fontFamily: "inherit",
    },
    numInput: {
      textAlign: "right", fontFamily: "'DM Mono', monospace", fontVariantNumeric: "tabular-nums",
    },
    derivedInput: { color: "#8A8271", fontStyle: "italic" },
    dupInput: { background: "#FBECEA", color: "#9E2B25", fontWeight: 600 },
    delBtn: {
      display: "inline-flex", background: "transparent", border: "none",
      color: "#C4483A", cursor: "pointer", padding: 6, borderRadius: 6,
    },
    empty: { padding: "34px 16px", textAlign: "center", color: "#9A9382", fontSize: 14 },
    note: { fontSize: 12.5, color: "#9A9382", marginTop: 16, maxWidth: 780, lineHeight: 1.6 },
  };
}
