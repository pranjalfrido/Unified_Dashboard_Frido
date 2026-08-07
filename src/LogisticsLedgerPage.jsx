import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import * as XLSXStyle from "xlsx-js-style";
import { Plus, Trash2, Download, Search, FileSpreadsheet, Upload, Truck, Package, RefreshCw, Save, AlertCircle } from "lucide-react";
import { supabase } from "./supabase.js";

// ── SCHEMA CONFIG ────────────────────────────────────────────────────────────

const FORMATS = {
  b2b: {
    key: "b2b",
    label: "B2B · Freight",
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
      { key: "transporter_name", label: "transporter_name", type: "text", req: true, w: 170, ex: "ABC Roadlines", desc: "Name of the B2B transporter" },
      { key: "reference_no", label: "reference_no", type: "text", req: true, w: 140, ex: "LR-778812", desc: "LR number or consignment reference" },
      { key: "origin_location", label: "origin_location", type: "text", req: true, w: 150, ex: "Bhiwandi WH", desc: "Warehouse/city goods dispatched from" },
      { key: "destination_location", label: "destination_location", type: "text", req: true, w: 170, ex: "Pune WH", desc: "Warehouse/city goods delivered to" },
      { key: "vehicle_number", label: "vehicle_number", type: "text", w: 140, ex: "MH12AB1234", desc: "Registration number of the vehicle" },
      { key: "vehicle_type", label: "vehicle_type", type: "text", w: 130, ex: "Eicher 14ft", desc: "Type/size of vehicle" },
      { key: "freight_type_FTL_PTL", label: "freight_type_FTL_PTL", type: "text", w: 165, ex: "PTL", desc: "FTL / PTL" },
      { key: "no_of_packages", label: "no_of_packages", type: "int", w: 130, ex: "120", desc: "Number of packages/cartons" },
      { key: "load_weight", label: "load_weight", type: "num", w: 120, ex: "2800", desc: "Actual weight loaded" },
      { key: "charged_weight", label: "charged_weight", type: "num", req: true, w: 135, ex: "2850", desc: "Weight the transporter billed on" },
      { key: "freight_charge", label: "freight_charge", type: "num", req: true, w: 130, ex: "9500", desc: "Base freight charge" },
      { key: "surcharge", label: "surcharge", type: "num", req: true, w: 110, ex: "650", desc: "Fuel surcharge or similar" },
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
      { key: "product", label: "product", type: "text", req: true, w: 175, ex: "Neck Pillow - Grey", desc: "Product/SKU shipped" },
      { key: "qty", label: "qty", type: "int", req: true, w: 80, ex: "1", desc: "Quantity shipped" },
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
      "awb_number is the unique key. Re-uploading an AWB REPLACES its stored row — no duplicates.",
      "If the same AWB appears twice in one file, the LAST occurrence wins.",
      "month_year must be YYYY-MM. shipment_date should be YYYY-MM-DD.",
      "total_cost is computed as freight_charge + surcharge + other_charge when left blank.",
      "payment_mode expects Prepaid or COD. shipment_mode expects Forward, RTO or Reverse.",
    ],
  },
};

// ── DATA LAYER ───────────────────────────────────────────────────────────────

const PK = "id";

const db = {
  async fetchRows(fmt) {
    const PAGE = 1000;
    let all = [], from = 0;
    while (true) {
      const { data, error } = await supabase
        .from(fmt.table)
        .select("*")
        .order("month_year", { ascending: false })
        .order(PK, { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      all = all.concat(data ?? []);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  },

  async insertRows(fmt, rows) {
    const out = [];
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => toDbRow(fmt, r));
      const q = fmt.uniqueKey
        ? supabase.from(fmt.table).upsert(chunk, { onConflict: fmt.uniqueKey, ignoreDuplicates: false })
        : supabase.from(fmt.table).insert(chunk);
      const { data, error } = await q.select();
      if (error) throw error;
      out.push(...(data ?? []));
    }
    return out;
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
};

const uid = () => Math.random().toString(36).slice(2, 10);
const todayMonth = () => new Date().toISOString().slice(0, 7);
const todayDate = () => new Date().toISOString().slice(0, 10);
const num = (v) => { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
const numOrNull = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const numOrRaw = (v) => { if (v === "" || v == null) return ""; const n = Number(v); return Number.isFinite(n) ? n : v; };
const sumParts = (fmt, r) => fmt.totalParts.reduce((s, k) => s + num(r[k]), 0);
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

// ── COMPONENT ─────────────────────────────────────────────────────────────────

export default function LogisticsLedgerPage() {
  const [tab, setTab] = useState("b2b");
  const fmt = FORMATS[tab];
  const [store, setStore] = useState({ b2b: null, b2c: null });
  const [query, setQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const fileInput = useRef(null);

  const rows = store[tab] ?? [];
  const setRows = useCallback(
    (fn) => setStore((s) => ({ ...s, [tab]: typeof fn === "function" ? fn(s[tab] ?? []) : fn })),
    [tab]
  );

  const flash = (kind, text) => {
    setStatus({ kind, text });
    if (kind !== "error") setTimeout(() => setStatus(null), 4000);
  };

  const load = useCallback(async (which) => {
    const f = FORMATS[which];
    setBusy(true);
    try {
      const data = await db.fetchRows(f);
      setStore((s) => ({ ...s, [which]: data.map((d) => fromDbRow(f, d)) }));
      flash("ok", `Loaded ${data.length} row${data.length !== 1 ? "s" : ""} from ${f.table}.`);
    } catch (e) {
      setStore((s) => ({ ...s, [which]: s[which] ?? [blankRow(f)] }));
      flash("error", `Couldn't load ${f.table}: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (store[tab] == null) load(tab); }, [tab, store, load]);

  const months = useMemo(() => Array.from(new Set(rows.map((r) => r.month_year).filter(Boolean))).sort().reverse(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (monthFilter && r.month_year !== monthFilter) return false;
      if (!q) return true;
      return fmt.searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q));
    });
  }, [rows, query, monthFilter, fmt]);

  const dupKeys = useMemo(() => {
    if (!fmt.uniqueKey) return new Set();
    const seen = new Map();
    for (const r of rows) { const v = String(r[fmt.uniqueKey] ?? "").trim().toLowerCase(); if (!v) continue; seen.set(v, (seen.get(v) ?? 0) + 1); }
    return new Set(Array.from(seen).filter(([, n]) => n > 1).map(([v]) => v));
  }, [rows, fmt]);

  const isDup = (r) => !!fmt.uniqueKey && dupKeys.has(String(r[fmt.uniqueKey] ?? "").trim().toLowerCase());

  const totals = useMemo(() => {
    let amount = 0;
    for (const r of filtered) amount += num(effectiveTotal(fmt, r));
    return { count: filtered.length, amount };
  }, [filtered, fmt]);

  const setCell = (rid, key, val) => setRows((rs) => rs.map((r) => (r._uid === rid ? { ...r, [key]: val, _dirty: true } : r)));

  const commitCell = async (rid) => {
    const row = rows.find((r) => r._uid === rid);
    if (!row || !row._dirty || !row[PK]) return;
    try {
      await db.updateRow(fmt, row);
      setRows((rs) => rs.map((r) => (r._uid === rid ? { ...r, _dirty: false } : r)));
    } catch (e) { flash("error", `Save failed: ${e.message ?? e}`); }
  };

  const addRow = () => setRows((rs) => [blankRow(fmt), ...rs]);

  const deleteRow = async (rid) => {
    const row = rows.find((r) => r._uid === rid);
    if (!row) return;
    if (row[PK] && !confirm(`Delete invoice ${row.invoice_number || "(blank)"}? This removes it from Supabase.`)) return;
    setRows((rs) => rs.filter((r) => r._uid !== rid));
    try { await db.deleteRow(fmt, row); } catch (e) { flash("error", `Delete failed: ${e.message ?? e}`); }
  };

  const saveAll = async () => {
    if (dupKeys.size) {
      const label = fmt.fields.find((f) => f.key === fmt.uniqueKey).label;
      flash("error", `Fix duplicate ${label}s before saving: ${Array.from(dupKeys).slice(0, 5).join(", ")}`);
      return;
    }
    const fresh = rows.filter((r) => !r[PK] && hasContent(fmt, r));
    const dirty = rows.filter((r) => r[PK] && r._dirty);
    if (!fresh.length && !dirty.length) { flash("ok", "Nothing to save — everything is already in Supabase."); return; }
    setBusy(true);
    try {
      for (const r of dirty) await db.updateRow(fmt, r);
      let inserted = [];
      if (fresh.length) inserted = await db.insertRows(fmt, fresh);
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
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const wb = XLSX.read(reader.result, { type: "array", cellDates: true });
        const dataName = wb.SheetNames.find((n) => n.trim().toLowerCase() === "billing_data") ?? wb.SheetNames.find((n) => !/^instruction/i.test(n.trim())) ?? wb.SheetNames[0];
        const ws = wb.Sheets[dataName];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
        if (!aoa.length) throw new Error("empty sheet");
        const wanted = fmt.fields.filter((f) => f.req).map(headKey);
        let hIdx = aoa.findIndex((r) => { const cells = r.map(normHead); return wanted.every((w) => cells.includes(w)); });
        if (hIdx === -1) { alert(`Couldn't find the header row for ${fmt.label}.\n\nRequired columns: ${fmt.fields.filter((f) => f.req).map((f) => f.label).join(", ")}.\n\nUse 'Download template' and keep its header row intact.`); return; }
        const head = aoa[hIdx].map(normHead);
        const idxOf = {};
        for (const f of fmt.fields) idxOf[f.key] = head.indexOf(headKey(f));
        const body = aoa.slice(hIdx + 1);
        const raw = body.map((r) => {
          const o = {};
          for (const f of fmt.fields) {
            const i = idxOf[f.key]; let v = i === -1 ? "" : r[i];
            if (f.type === "month") v = normMonth(v) ?? "";
            else if (f.type === "date") v = normDate(v);
            else v = v == null ? "" : String(v).trim();
            o[f.key] = v;
          }
          return o;
        });
        const sampleSigs = [fmt.fields.reduce((o, f) => ((o[f.key] = f.ex ?? ""), o), {}), SAMPLE2[fmt.key] ?? {}];
        const sigKeys = [fmt.uniqueKey ?? "reference_no", "invoice_number"].filter(Boolean);
        const isSample = (r) => sampleSigs.some((sig) => sigKeys.every((k) => String(sig[k] ?? "").trim() !== "" && String(r[k] ?? "").trim().toLowerCase() === String(sig[k]).trim().toLowerCase()));
        const nonEmpty = raw.filter((r) => fmt.fields.some((f) => r[f.key] !== ""));
        const nonSample = nonEmpty.filter((r) => !isSample(r));
        // If all rows are samples (user uploading blank template), let them through so upload doesn't silently fail
        const candidates = nonSample.length > 0 ? nonSample : nonEmpty;
        const bad = []; const good = [];
        candidates.forEach((r, i) => {
          const missing = fmt.fields.filter((f) => f.req && !f.computed && r[f.key] === "").map((f) => f.label);
          for (const f of fmt.fields) { if (f.req && f.computed && r[f.key] === "" && sumParts(fmt, r) === 0) missing.push(f.label); }
          if (missing.length) bad.push({ line: hIdx + 2 + i, missing }); else good.push(r);
        });
        if (bad.length) {
          const preview = bad.slice(0, 8).map((b) => `• row ${b.line}: missing ${b.missing.join(", ")}`).join("\n");
          if (!confirm(`${bad.length} row${bad.length !== 1 ? "s" : ""} will be skipped:\n\n${preview}\n\nImport the ${good.length} valid rows anyway?`)) return;
        }
        if (!good.length) { alert("No valid rows found."); return; }
        let final = good; let dupInFile = 0; let replacing = [];
        if (fmt.uniqueKey) {
          const byKey = new Map();
          for (const r of good) { const k = String(r[fmt.uniqueKey]).trim().toLowerCase(); if (byKey.has(k)) dupInFile++; byKey.set(k, r); }
          final = Array.from(byKey.values());
          const existing = new Map(rows.filter((r) => String(r[fmt.uniqueKey] ?? "").trim() !== "").map((r) => [String(r[fmt.uniqueKey]).trim().toLowerCase(), r]));
          replacing = final.filter((r) => existing.has(String(r[fmt.uniqueKey]).trim().toLowerCase()));
          if (replacing.length) { if (!confirm(`${replacing.length} AWB(s) already exist and will be REPLACED. Continue?`)) return; }
          final = final.map((r) => { const hit = existing.get(String(r[fmt.uniqueKey]).trim().toLowerCase()); return hit && hit[PK] ? { ...r, [PK]: hit[PK] } : r; });
        }
        const staged = final.map((r) => ({ ...r, _uid: uid(), [PK]: r[PK] ?? null, _dirty: true }));
        const mergeIntoGrid = (rs, incoming) => {
          if (!fmt.uniqueKey) return [...incoming, ...rs];
          const k = (r) => String(r[fmt.uniqueKey] ?? "").trim().toLowerCase();
          const incomingByKey = new Map(incoming.map((r) => [k(r), r]));
          const kept = rs.map((r) => incomingByKey.get(k(r)) ?? r);
          const seen = new Set(rs.map(k));
          const brandNew = incoming.filter((r) => !seen.has(k(r)));
          return [...brandNew, ...kept];
        };
        setBusy(true);
        try {
          const written = await db.insertRows(fmt, staged);
          const asRows = written.map((d) => fromDbRow(fmt, d));
          setRows((rs) => mergeIntoGrid(rs, asRows));
          flash("ok", `Uploaded ${asRows.length} line${asRows.length !== 1 ? "s" : ""} to ${fmt.table} — ${final.length - replacing.length} new, ${replacing.length} replaced${dupInFile ? `, ${dupInFile} duplicates collapsed` : ""}.`);
        } finally { setBusy(false); }
      } catch (err) { alert(`Couldn't read that file: ${err.message ?? err}`); }
      finally { if (fileInput.current) fileInput.current.value = ""; }
    };
    reader.readAsArrayBuffer(file);
  };

  const exportCSV = () => {
    const data = filtered.filter((r) => hasContent(fmt, r));
    if (!data.length) return alert("Nothing to export.");
    const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [fmt.fields.map((f) => esc(f.label)).join(",")];
    for (const r of data) lines.push(fmt.fields.map((f) => esc(f.key === fmt.totalField ? effectiveTotal(fmt, r) : r[f.key] ?? "")).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${fmt.exportPrefix}_${todayDate()}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const exportXLSX = () => {
    const data = filtered.filter((r) => hasContent(fmt, r));
    if (!data.length) return alert("Nothing to export.");
    const green = "1F5C4A";
    const styleHdr = (ws, n) => { for (let c = 0; c < n; c++) { const a = XLSX.utils.encode_cell({ r: 0, c }); if (ws[a]) ws[a].s = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 }, fill: { fgColor: { rgb: green } } }; } };
    const head = fmt.fields.map((f) => f.label);
    const body = data.map((r) => fmt.fields.map((f) => f.key === fmt.totalField ? numOrRaw(effectiveTotal(fmt, r)) : f.type === "num" || f.type === "int" ? numOrRaw(r[f.key]) : r[f.key] ?? ""));
    const wsAll = XLSX.utils.aoa_to_sheet([head, ...body]);
    wsAll["!cols"] = fmt.fields.map((f) => ({ wch: Math.max(12, Math.round(f.w / 8)) }));
    styleHdr(wsAll, head.length);
    const party = fmt.key === "b2b" ? "transporter_name" : "courier_name";
    const agg = new Map();
    for (const r of data) { const k = `${r.month_year}||${r[party] || "(blank)"}`; const cur = agg.get(k) ?? { lines: 0, amount: 0 }; cur.lines += 1; cur.amount += num(effectiveTotal(fmt, r)); agg.set(k, cur); }
    const sumHead = ["Month Year", fmt.fields.find((f) => f.key === party).label, "Lines", "Total Cost"];
    const sumBody = Array.from(agg.entries()).sort(([a], [b]) => (a < b ? 1 : -1)).map(([k, v]) => { const [m, p] = k.split("||"); return [m, p, v.lines, Number(v.amount.toFixed(2))]; });
    const wsSum = XLSX.utils.aoa_to_sheet([sumHead, ...sumBody]);
    wsSum["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 10 }, { wch: 16 }];
    styleHdr(wsSum, sumHead.length);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsAll, "Invoice Lines");
    XLSX.utils.book_append_sheet(wb, wsSum, "Month Summary");
    XLSX.writeFile(wb, `${fmt.exportPrefix}_${todayDate()}.xlsx`);
  };

  const unsaved = rows.filter((r) => (!r[PK] && hasContent(fmt, r)) || r._dirty).length;
  const TabIcon = fmt.icon;

  // light theme matching other dashboard tabs
  const C = { bg: '#F7F8FA', card: '#FFFFFF', border: '#E8E4DA', t1: '#1A1A2E', t2: '#4A4A6A', t3: '#9A9AB0', accent: '#2F6A45', green: '#166534', red: '#9E2B25' };

  const btnBase = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${C.border}` };
  const ghostBtn = { ...btnBase, background: C.card, color: C.t2 };
  const primaryBtn = { ...btnBase, background: C.accent, color: '#fff', border: 'none' };
  const chipBtn = { ...btnBase, background: '#EAF1EC', color: C.accent, borderRadius: 20 };
  const chipHot = { background: '#FEF3C7', color: '#92400E', borderColor: '#FDE68A' };

  return (
    <div style={{ padding: '24px 32px 48px', minHeight: '100vh', background: C.bg, color: C.t1, fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Invoice-wise · transactional</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.t1, letterSpacing: -0.5 }}>Logistics Bill Ledger</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 10px' }}>
            <Search size={13} style={{ color: C.t3 }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter invoices…"
              style={{ border: 'none', background: 'transparent', fontSize: 12, color: C.t1, width: 140, outline: 'none' }} />
          </div>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}
            style={{ ...ghostBtn, padding: '6px 10px' }}>
            <option value="">All months</option>
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button style={ghostBtn} onClick={downloadTemplate}><FileSpreadsheet size={13} /> Template</button>
          <button style={ghostBtn} onClick={() => fileInput.current?.click()} disabled={busy}><Upload size={13} /> Upload</button>
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={importTemplate} style={{ display: 'none' }} />
          <button style={ghostBtn} onClick={exportCSV}><Download size={13} /> CSV</button>
          <button style={primaryBtn} onClick={exportXLSX}><Download size={13} /> Excel</button>
        </div>
      </div>

      {/* Format tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 14 }}>
        {Object.values(FORMATS).map((f) => {
          const Ico = f.icon; const active = f.key === tab;
          return (
            <button key={f.key} onClick={() => setTab(f.key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', borderBottom: `2px solid ${active ? C.accent : 'transparent'}`, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: active ? C.accent : C.t2, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Ico size={14} /> {f.label}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: C.t3, fontFamily: 'monospace', paddingBottom: 8 }}>{fmt.table}</span>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button style={chipBtn} onClick={addRow}><Plus size={13} /> Add invoice line</button>
        <button style={{ ...chipBtn, ...(unsaved ? chipHot : {}) }} onClick={saveAll} disabled={busy}><Save size={13} /> Save{unsaved ? ` (${unsaved})` : ''}</button>
        <button style={chipBtn} onClick={() => load(tab)} disabled={busy}><RefreshCw size={13} /> Reload</button>
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
                <th key={f.key} style={{ position: 'sticky', top: 0, zIndex: i === 0 ? 3 : 2, left: i === 0 ? 0 : undefined, background: '#F5F2EC', textAlign: f.type === 'num' || f.type === 'int' ? 'right' : 'left', padding: '9px 10px', fontSize: 11, fontWeight: 700, color: C.t2, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', minWidth: f.w }}
                  title={[f.desc, f.req ? 'Mandatory.' : 'Optional.', f.computed ? 'Auto-computed.' : null].filter(Boolean).join(' ')}>
                  {f.label}{f.req && <span style={{ color: C.red }}> *</span>}{f.computed && <span style={{ color: C.t3 }}> ƒ</span>}
                </th>
              ))}
              <th style={{ position: 'sticky', top: 0, zIndex: 2, background: '#F5F2EC', width: 40, borderBottom: `1px solid ${C.border}` }} />
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
                onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = '#FAFAF7')}
                onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = C.card)}>
                {fmt.fields.map((f, i) => {
                  const isTotal = f.key === fmt.totalField;
                  const derived = isTotal && !isTotalOverridden(fmt, r);
                  const shown = derived ? effectiveTotal(fmt, r) : r[f.key] ?? "";
                  const dupCell = f.key === fmt.uniqueKey && isDup(r);
                  return (
                    <td key={f.key} style={{ padding: 0, background: C.card, position: i === 0 ? 'sticky' : undefined, left: i === 0 ? 0 : undefined, zIndex: i === 0 ? 1 : undefined }}>
                      <input
                        value={derived ? (shown === "" ? "" : String(shown)) : shown}
                        placeholder={derived ? "auto" : f.type === "num" ? "0.00" : f.label}
                        inputMode={f.type === "num" || f.type === "int" ? "decimal" : undefined}
                        onChange={(e) => setCell(r._uid, f.key, e.target.value)}
                        onBlur={() => commitCell(r._uid)}
                        style={{ width: '100%', border: 'none', background: dupCell ? '#FEF2F2' : 'transparent', padding: '9px 10px', fontSize: 12.5, color: dupCell ? C.red : derived ? C.t3 : C.t1, fontFamily: derived || f.type === 'num' || f.type === 'int' ? 'monospace' : 'inherit', textAlign: f.type === 'num' || f.type === 'int' ? 'right' : 'left', fontStyle: derived ? 'italic' : 'normal', outline: 'none' }}
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
        {fmt.uniqueKey ? <>One row per <strong style={{ color: C.t2 }}>{fmt.fields.find((f) => f.key === fmt.uniqueKey).label}</strong>. Re-uploading an existing AWB <strong style={{ color: C.t2 }}>replaces</strong> that row.</> : <>One row per invoice line, appended — uploads never overwrite.</>}{' '}
        <span style={{ color: C.t3 }}>ƒ</span> Total Cost is computed from {fmt.totalParts.length} charge components when left blank; typing a value overrides it.
      </p>
    </div>
  );
}
