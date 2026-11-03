// Client side of the CN upload engine (scripts/sql/cn/003_cn_upload_engine.sql): template,
// file parsing, staging in chunks, preview rows, error report, commit. One implementation
// for every upload type, driven by its cn_upload_types row.
import * as XLSX from "xlsx";
import { supabase } from "../supabase.js";
import { buildTemplateBytes, headerFor } from "./cnTemplate.js";

export { headerFor };

// 1,000 rows per call: about 1 s of database work, well inside the 8 s statement timeout
// even when the shared database is busy (2,000-row calls measured 1.2–3.7 s).
const STAGE_CHUNK = 1000;

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

// For calls that are safe to repeat (staging overwrites the same rows; validation recomputes
// from scratch): retry a timeout or dropped connection a couple of times. Never used for commit.
const TRANSIENT = /statement timeout|fetch|network|timed out|connection|ECONNRESET|503|504/i;
async function rpcRetry(fn, args, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try { return await rpc(fn, args); }
    catch (e) {
      if (attempt >= tries || !TRANSIENT.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

export async function loadUploadType(code) {
  const { data, error } = await supabase.from("cn_upload_types").select("*").eq("code", code).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Upload type ${code} is not set up in the database yet.`);
  return data;
}


function download(bytes, fileName) {
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: fileName });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Template: exact headers (optional ones marked), one sample row, an instruction sheet, and
// a drop-down on every enum column.
export const downloadTemplate = (cfg) => download(buildTemplateBytes(cfg), cfg.template_file);


export function parseFile(file, columns) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.onload = () => {
      const worker = new Worker(new URL("./cnParseWorker.js", import.meta.url), { type: "module" });
      worker.onmessage = (e) => { worker.terminate(); e.data.error ? reject(new Error(e.data.error)) : resolve(e.data); };
      worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || "Couldn't read the file.")); };
      worker.postMessage({ buffer: reader.result, fileName: file.name, columns }, [reader.result]);
    };
    reader.readAsArrayBuffer(file);
  });
}

// Create the batch (header check), stage every row in chunks, then validate.
export async function uploadAndValidate(cfg, fileName, parsed, onProgress) {
  const created = await rpc("cn_create_batch", { p_type: cfg.code, p_file_name: fileName, p_headers: parsed.headers });
  const id = created.batch_id;
  for (let i = 0; i < parsed.rows.length; i += STAGE_CHUNK) {
    await rpcRetry("cn_stage_rows", { p_batch_id: id, p_rows: parsed.rows.slice(i, i + STAGE_CHUNK) });
    onProgress?.({ step: "staging", done: Math.min(i + STAGE_CHUNK, parsed.rows.length), total: parsed.rows.length });
  }
  onProgress?.({ step: "validating" });
  const summary = await rpcRetry("cn_validate_batch", { p_batch_id: id });
  return { batchId: id, ignored: created.ignored ?? [], headerMap: created.header_map, summary };
}

export const revalidate = (batchId) => rpcRetry("cn_validate_batch", { p_batch_id: batchId });
export const commitBatch = (batchId, token) => rpc("cn_commit_batch", { p_batch_id: batchId, p_token: token });
export const discardBatch = (batchId) => rpc("cn_discard_batch", { p_batch_id: batchId });

// Batch status, for following a commit that runs in the background.
export async function fetchBatch(batchId) {
  const { data, error } = await supabase.from("cn_upload_batches")
    .select("id, status, inserted_rows, replaced_rows, failed_rows, blocked_scopes, commit_error").eq("id", batchId).single();
  if (error) throw new Error(error.message);
  return data;
}

const ROW_COLS = "row_no, raw, scope_key, errors, x_errors, warnings, x_warnings, has_error, has_warning, blocked_note";

// One page of preview rows. filter: "all" | "errors" | "warnings".
export async function fetchStagedRows(batchId, { filter = "all", page = 0, pageSize = 100 } = {}) {
  let q = supabase.from("cn_staging_rows").select(ROW_COLS, { count: "exact" }).eq("batch_id", batchId).order("row_no");
  // "errors": everything that won't be saved, including clean rows held back by a blocked scope.
  if (filter === "errors") q = q.or("has_error.eq.true,blocked_note.not.is.null");
  if (filter === "warnings") q = q.eq("has_warning", true);
  const { data, error, count } = await q.range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], count: count ?? 0 };
}

// One page of the file's scopes (Month + partner), blocked first, then replace, then new.
export async function fetchScopes(batchId, { page = 0, pageSize = 100 } = {}) {
  const { data, error, count } = await supabase.from("cn_batch_scopes")
    .select("scope_key, label, status, existing_rows, new_rows, error_rows, blocked_by, warnings", { count: "exact" })
    .eq("batch_id", batchId).order("sort_rank").order("label").range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw new Error(error.message);
  return { scopes: data ?? [], count: count ?? 0 };
}

// Why a row won't be saved (its own errors, or the note on a clean row in a blocked scope).
export function rowMessages(row) {
  const errors = [...(row.errors ?? []), ...(row.x_errors ?? [])];
  if (row.blocked_note) errors.push(row.blocked_note);
  return { errors, warnings: [...(row.warnings ?? []), ...(row.x_warnings ?? [])] };
}

// The file as uploaded plus Errors and Warnings columns.
export async function downloadErrorReport(batchId, headers, fileName) {
  const all = [];
  for (let page = 0; ; page++) {
    const { rows } = await fetchStagedRows(batchId, { page, pageSize: 1000 });
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  // raw is the row's cells in header order.
  const cols = headers.map((h, i) => [h, i]).filter(([h]) => h);
  const aoa = [[...cols.map(([h]) => h), "Errors", "Warnings"]];
  for (const r of all) {
    const m = rowMessages(r);
    aoa.push([...cols.map(([, i]) => r.raw?.[i] ?? ""), m.errors.join("; "), m.warnings.join("; ")]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [...cols.map(() => ({ wch: 18 })), { wch: 70 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "data");
  XLSX.writeFile(wb, fileName.replace(/\.(xlsx|xls|csv)$/i, "") + "_errors.xlsx");
}
