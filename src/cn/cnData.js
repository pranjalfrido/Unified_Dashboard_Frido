// Listings of saved credit-note rows and the upload history. Reads the cn_*_v views (active
// rows, with Pending CN and Recovery % worked out); edits, deletes and rollbacks go through
// the database functions in scripts/sql/cn/006, which check the caller may manage.
import * as XLSX from "xlsx";
import { supabase } from "../supabase.js";

const AMT = "amount";
// Columns shown per upload type, in order. `key` is the view column.
export const LIST_COLUMNS = {
  weight_dispute: [
    { key: "month", label: "Month", type: "month" }, { key: "courier", label: "Courier" }, { key: "courier_account", label: "Courier Account" },
    { key: "invoice_value", label: "Invoice Value", type: AMT }, { key: "expected_cn", label: "Expected CN", type: AMT },
    { key: "received_cn", label: "Received CN", type: AMT }, { key: "pending_cn", label: "Pending CN", type: AMT },
    { key: "recovery_pct", label: "Recovery %", type: "pct" },
  ],
  lost_damage: [
    { key: "awb", label: "AWB" }, { key: "month", label: "Month", type: "month" }, { key: "courier", label: "Courier" },
    { key: "courier_account", label: "Courier Account" }, { key: "reason", label: "Reason" },
    { key: "shipment_value", label: "Shipment Value", type: AMT }, { key: "expected_cn", label: "Expected CN", type: AMT },
    { key: "cn_received_amt", label: "CN Received Amt", type: AMT }, { key: "cn_number", label: "CN No." },
    { key: "pending_cn", label: "Pending CN", type: AMT }, { key: "recovery_pct", label: "Recovery %", type: "pct" },
  ],
  ftl_ptl: [
    { key: "month", label: "Month", type: "month" }, { key: "transporter", label: "Transporter" },
    { key: "invoice_value", label: "Invoice Value", type: AMT }, { key: "expected_cn", label: "Expected CN", type: AMT },
    { key: "received_cn", label: "Received CN", type: AMT }, { key: "pending_cn", label: "Pending CN", type: AMT },
    { key: "recovery_pct", label: "Recovery %", type: "pct" },
  ],
  "3pl": [
    { key: "month", label: "Month", type: "month" }, { key: "partner", label: "3PL Partner" }, { key: "facility", label: "3PL Facility" },
    { key: "location", label: "Location" }, { key: "invoice_value", label: "Invoice Value", type: AMT },
    { key: "expected_cn", label: "Expected CN", type: AMT }, { key: "received_cn", label: "Received CN", type: AMT },
    { key: "pending_cn", label: "Pending CN", type: AMT }, { key: "recovery_pct", label: "Recovery %", type: "pct" },
  ],
};

// The partner's display column in each view, for sorting.
const PARTNER_NAME = { weight_dispute: "courier", lost_damage: "courier", ftl_ptl: "transporter", "3pl": "partner" };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (d) => (d ? `${MON[Number(d.slice(5, 7)) - 1]}-${d.slice(0, 4)}` : "");

// filters: { from: "YYYY-MM", to: "YYYY-MM", partnerId, reason, awb }
function query(cfg, filters, { count } = {}) {
  let q = supabase.from(`${cfg.target_table}_v`).select("*", count ? { count: "exact" } : undefined);
  if (filters.from) q = q.gte("month", `${filters.from}-01`);
  if (filters.to) q = q.lte("month", `${filters.to}-01`);
  if (filters.partnerId) q = q.eq(cfg.partner_col, filters.partnerId);
  if (filters.reason) q = q.eq("reason", filters.reason);
  if (filters.awb) q = q.ilike("awb", `%${filters.awb.trim().toUpperCase()}%`);
  return q.order("month", { ascending: false }).order(PARTNER_NAME[cfg.code]).order("id");
}

export async function fetchData(cfg, filters, { page = 0, pageSize = 100 } = {}) {
  const { data, error, count } = await query(cfg, filters, { count: true }).range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], count: count ?? 0 };
}

export async function fetchPartners(cfg) {
  const { data, error } = await supabase.from(cfg.partner_table).select("id, name").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Every row matching the filters, as an Excel file.
export async function exportData(cfg, filters, onProgress) {
  const all = [];
  for (let page = 0; ; page++) {
    const { data, error } = await query(cfg, filters).range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    onProgress?.(all.length);
    if (!data || data.length < 1000) break;
  }
  const cols = [...LIST_COLUMNS[cfg.code], { key: "batch_id", label: "Upload batch" }];
  const aoa = [cols.map((c) => c.label), ...all.map((r) => cols.map((c) =>
    c.type === "month" ? monthLabel(r[c.key]) : c.type === AMT || c.type === "pct" ? (r[c.key] == null ? "" : Number(r[c.key])) : r[c.key] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = cols.map((c) => ({ wch: Math.max(12, c.label.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "data");
  XLSX.writeFile(wb, `${cfg.code}_cn_${new Date().toISOString().slice(0, 10)}.xlsx`);
  return all.length;
}

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export const updateRow = (cfg, id, changes) => rpc("cn_update_row", { p_type: cfg.code, p_id: id, p_changes: changes });
export const deleteRow = (cfg, id) => rpc("cn_delete_row", { p_type: cfg.code, p_id: id });

export async function listBatches({ type = null, status = null, page = 0, pageSize = 50 } = {}) {
  const rows = await rpc("cn_list_batches", { p_type: type, p_status: status, p_limit: pageSize, p_offset: page * pageSize });
  return { rows: rows ?? [], count: Number(rows?.[0]?.total ?? 0) };
}

export async function fetchBatchDetail(id) {
  const { data, error } = await supabase.from("cn_upload_batches").select("id, upload_type, file_name, headers, header_map").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

export const rollbackBatch = (id) => rpc("cn_rollback_batch", { p_batch_id: id });
