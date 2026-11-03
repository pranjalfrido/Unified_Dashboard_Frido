// Data layer for Logistics Credit Notes. The browser talks to Supabase directly, as the other
// Documents ledgers do; row-level security (scripts/sql/cn/001_cn_schema.sql) decides who
// may read or change what, so these helpers only translate errors into plain messages.
import { supabase } from "../supabase.js";

// Master lists. `ref` columns pick from another master; `list` columns are text[] edited as
// comma-separated text.
export const MASTERS = {
  couriers: {
    key: "couriers", label: "Couriers", table: "cn_couriers", order: "name",
    columns: [
      { key: "name", label: "Courier", req: true, w: 200 },
      { key: "ledger_names", label: "Bill-ledger names", type: "list", w: 260, hint: "courier_name values in the B2C bill ledger" },
    ],
  },
  accounts: {
    key: "accounts", label: "Courier accounts", table: "cn_courier_accounts", order: "name",
    columns: [
      { key: "courier_id", label: "Courier", req: true, ref: "couriers", w: 170 },
      { key: "name", label: "Account", req: true, w: 200 },
      { key: "ledger_keys", label: "Bill-ledger account types", type: "pairs", w: 300, readOnly: true, hint: "courier_name / courier_account_type pairs, set when seeding" },
    ],
  },
  transporters: {
    key: "transporters", label: "Transporters", table: "cn_transporters", order: "name",
    columns: [
      { key: "name", label: "Transporter", req: true, w: 220 },
      { key: "ledger_names", label: "Bill-ledger names", type: "list", w: 300, hint: "transporter_name / transport_name values in the FTL/PTL ledgers" },
    ],
  },
  partners: {
    key: "partners", label: "3PL partners", table: "cn_3pl_partners", order: "name",
    columns: [
      { key: "name", label: "3PL partner", req: true, w: 200 },
      { key: "ledger_names", label: "Bill-ledger names", type: "list", w: 260, hint: "threepl_logistics_name values in the 3PL ledger" },
    ],
  },
  facilities: {
    key: "facilities", label: "3PL facilities", table: "cn_3pl_facilities", order: "name",
    columns: [
      { key: "partner_id", label: "3PL partner", req: true, ref: "partners", w: 160 },
      { key: "name", label: "Facility", req: true, w: 190 },
      { key: "location", label: "Location", req: true, w: 130 },
      { key: "pincode", label: "Pincode", w: 100 },
      { key: "ledger_names", label: "Bill-ledger names", type: "list", w: 200, hint: "facility_name values in the 3PL ledger" },
    ],
  },
};

export function friendlyError(e) {
  const msg = e?.message ?? String(e);
  if (e?.code === "23505") return "That name already exists (names are matched ignoring case and extra spaces).";
  if (e?.code === "23503") return "It is used by uploaded credit-note rows — deactivate it instead of deleting.";
  if (e?.code === "42501" || /row-level security/i.test(msg)) return "You don't have permission to change masters (needs Documents → Credit notes: manage).";
  return msg;
}

export async function canManage() {
  const { data, error } = await supabase.rpc("cn_can_manage");
  return !error && data === true;
}

export async function listMaster(m) {
  const { data, error } = await supabase.from(m.table).select("*").order(m.order);
  if (error) throw new Error(friendlyError(error));
  return data ?? [];
}

// Only the editable columns are sent; generated and audit columns are the database's.
function payload(m, row) {
  const out = { is_active: row.is_active ?? true };
  for (const c of m.columns) {
    if (c.readOnly) continue;
    const v = row[c.key];
    if (c.type === "list") out[c.key] = String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (c.ref) out[c.key] = v === "" || v == null ? null : Number(v);
    else out[c.key] = v === "" || v == null ? null : String(v).trim();
  }
  return out;
}

export async function saveMaster(m, row) {
  const missing = m.columns.filter((c) => c.req && String(row[c.key] ?? "").trim() === "").map((c) => c.label);
  if (missing.length) throw new Error(`Fill in ${missing.join(", ")}.`);
  const q = row.id
    ? supabase.from(m.table).update(payload(m, row)).eq("id", row.id).select()
    : supabase.from(m.table).insert(payload(m, row)).select();
  const { data, error } = await q;
  if (error) throw new Error(friendlyError(error));
  // RLS turns a forbidden update into "0 rows" rather than an error.
  if (!data?.length) throw new Error(friendlyError({ code: "42501" }));
  return data[0];
}

export async function deleteMaster(m, id) {
  const { data, error } = await supabase.from(m.table).delete().eq("id", id).select("id");
  if (error) throw new Error(friendlyError(error));
  if (!data?.length) throw new Error(friendlyError({ code: "42501" }));
}
