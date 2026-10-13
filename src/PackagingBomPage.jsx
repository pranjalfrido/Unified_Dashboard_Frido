import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { Plus, Trash2, Save, RefreshCw, Search, FileSpreadsheet, Upload, Download, ArrowLeft } from "lucide-react";
import { supabase } from "./supabase.js";
import { C as BASE_C } from "./utils.js";

// A plain <select> is unusable once the option list runs into the hundreds (323 products here) —
// no way to jump to an item by typing more than one matching letter at a time in most browsers.
// This is a small type-to-filter combobox: text input + a filtered dropdown list beneath it.
function SearchableSelect({ value, onChange, options, placeholder, style, renderOption, onAddNew, addNewLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selectedLabel = options.find(o => o.value === value)?.label ?? "";

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <div style={{ position: "relative" }}>
        <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9A9382", pointerEvents: "none" }} />
        <input
          value={open ? query : selectedLabel}
          onChange={e => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setQuery(""); setOpen(true); }}
          placeholder={placeholder}
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid #DDD6C7", background: "#fff", color: "#1A1D1F", borderRadius: 7, padding: "8px 10px 8px 28px", fontSize: 13, fontFamily: "inherit" }}
        />
      </div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, maxHeight: 280, overflowY: "auto", background: "#fff", border: "1px solid #DDD6C7", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.12)", zIndex: 50 }}>
          <div onClick={() => { onChange(""); setQuery(""); setOpen(false); }}
            style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", color: "#9A9382" }}
            onMouseEnter={e => e.currentTarget.style.background = "#F5F2E9"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            {placeholder}
          </div>
          {filtered.length === 0 && <div style={{ padding: "8px 12px", fontSize: 12.5, color: "#9A9382" }}>No matches.</div>}
          {filtered.map(o => (
            <div key={o.value} onClick={() => { onChange(o.value); setQuery(""); setOpen(false); }}
              style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", background: o.value === value ? "#EAF1EC" : "transparent" }}
              onMouseEnter={e => e.currentTarget.style.background = o.value === value ? "#EAF1EC" : "#F5F2E9"}
              onMouseLeave={e => e.currentTarget.style.background = o.value === value ? "#EAF1EC" : "transparent"}>
              {renderOption ? renderOption(o) : o.label}
            </div>
          ))}
          {onAddNew && (
            <div onClick={() => { onAddNew(query); setQuery(""); setOpen(false); }}
              style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", fontWeight: 600, color: "#1F5C4A", borderTop: "1px solid #EDE9DC" }}
              onMouseEnter={e => e.currentTarget.style.background = "#F5F2E9"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              + {addNewLabel || "Add new…"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Packaging BOM ────────────────────────────────────────────────────────────
// Product = item_master.Sub_category (packaging is defined at sub-category level,
// not per exact SKU — confirmed 2026-09-30, all variants of a sub-category share
// the same packaging). For each product, the BOM is a list of rows, each pointing
// at one real packaging SKU from packaging_sku_master (the Sheet-backed master,
// synced hourly from BigQuery — confirmed 2026-10-11, replacing the earlier
// material-type/sub-type split, which is now gone). Cost resolution per row:
// cost_override (if set on this BOM row) > packaging_sku_master.cost_per_unit
// (if the master has one) — the master is still being populated, so most SKUs
// currently have no cost, which is why the override field exists at all.

const uid = () => Math.random().toString(36).slice(2, 10);
const API = import.meta.env.VITE_API_URL || "";
const toNum = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

export default function PackagingBomPage({ onBack }) {
  const C = { bg: BASE_C.bg, card: BASE_C.card, border: BASE_C.border, t1: BASE_C.t1, t2: BASE_C.t2, t3: BASE_C.t3, accent: BASE_C.acc, red: BASE_C.red.tx };
  const btnBase = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${C.border}` };
  const ghostBtn = { ...btnBase, background: C.card, color: C.t2 };
  const primaryBtn = { ...btnBase, background: C.accent, color: '#fff', border: 'none' };
  const selectStyle = { border: `1px solid ${C.border}`, background: C.card, color: C.t1, borderRadius: 7, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', minWidth: 180 };

  const [products, setProducts] = useState([]);       // distinct Sub_category values from item_master (live, re-derived every load)
  const [productCodesBySubCategory, setProductCodesBySubCategory] = useState({}); // Sub_category -> [Product_Code] (live, re-derived every load)
  const [skuMaster, setSkuMaster] = useState([]);      // packaging_sku_master rows
  const [bom, setBom] = useState([]);                  // all packaging_bom rows, loaded fresh each product switch

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [rows, setRows] = useState([]);                // rows being edited for selectedProduct: [{_uid, packaging_sku, qty_per_unit, cost_override, _dirty}]
  const [divergence, setDivergence] = useState(null);  // non-null when this Sub_category's Product_Codes carry genuinely different BOMs — see effect below
  const [showInactive, setShowInactive] = useState(false);
  const [newSkuFor, setNewSkuFor] = useState(null); // _uid of the row currently defining a brand-new SKU, or null
  const [newSkuForm, setNewSkuForm] = useState({ packaging_sku: "", packaging_type: "", packaging_name: "", cost_per_unit: "" });

  const [uploadProgress, setUploadProgress] = useState(null);
  const fileInput = useRef(null);

  const flash = (kind, text) => {
    setStatus({ kind, text });
    if (kind !== "error") setTimeout(() => setStatus(null), 4000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [productsRes, { data: sm, error: smErr }, { data: extra, error: extraErr }, { data: b, error: bErr }] = await Promise.all([
        // detail=1 gives every real Product_Code with its CURRENT Sub_category, read live from
        // BigQuery on every load (api/packaging-products.js) — this is what lets a Sub_category
        // rename in the Sheet be picked up automatically (confirmed 2026-10-12): packaging_bom is
        // keyed on the stable Product_Code, never on this text, so grouping Product_Codes by their
        // live Sub_category here is what "follows" a rename instead of getting orphaned by it.
        fetch(`${API}/api/packaging-products?detail=1`).then(r => r.json()),
        supabase.from("packaging_sku_master").select("packaging_sku, packaging_type, packaging_name, cost_per_unit, vendor, is_active, linked_product, vol_weight_gm").order("packaging_type"),
        // packaging_sku_master_extra: SKUs added inline via the uploader for something not yet in
        // the Sheet (confirmed 2026-10-12) — merged into the same list below, flagged as such.
        supabase.from("packaging_sku_master_extra").select("packaging_sku, packaging_type, packaging_name, cost_per_unit, vendor, linked_product, vol_weight_gm"),
        supabase.from("packaging_bom").select("product_code, packaging_sku, qty_per_unit, cost_override, batch_id, batch_source, batch_note, updated_at").order("updated_at", { ascending: false }),
      ]);
      if (productsRes.error) throw new Error(productsRes.error);
      if (smErr) throw smErr;
      if (extraErr) throw extraErr;
      if (bErr) throw bErr;

      // "Packaging" category is already excluded server-side (api/packaging-products.js) —
      // its own SKUs are packaging components, not real products that get their own BOM.
      const detailRows = (productsRes.products ?? []).filter(r => r.product_code && r.sub_category);
      const bySubCat = {};
      detailRows.forEach(r => { (bySubCat[r.sub_category] ??= []).push(r.product_code); });
      setProductCodesBySubCategory(bySubCat);
      setProducts(Object.keys(bySubCat).sort());
      // All packaging_sku_master columns arrive as TEXT from the Sheet sync — normalize once here
      // so the rest of the page can treat cost/weight as numbers and isActive as a real boolean.
      const sheetSkus = (sm ?? []).map(s => ({
        ...s,
        cost_per_unit: toNum(s.cost_per_unit),
        vol_weight_gm: toNum(s.vol_weight_gm),
        // Blank isActive in the sheet is treated as active (most rows have no value set yet) —
        // only an explicit "false"/"no"/"0"/"inactive" hides a SKU from the picker by default.
        is_active: !/^(false|no|0|inactive|n)$/i.test(String(s.is_active ?? "").trim()),
        _fromSheet: true,
      }));
      const sheetSkuCodes = new Set(sheetSkus.map(s => s.packaging_sku));
      // A SKU added via the uploader stops being "extra" once it genuinely shows up in the Sheet
      // sync (same packaging_sku) — the Sheet-synced copy wins and the extra row becomes inert.
      const extraSkus = (extra ?? [])
        .filter(s => !sheetSkuCodes.has(s.packaging_sku))
        .map(s => ({ ...s, is_active: true, _fromSheet: false }));
      setSkuMaster([...sheetSkus, ...extraSkus]);
      setBom(b ?? []);
    } catch (e) {
      flash("error", `Load failed: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Load this product's existing BOM rows into the editable grid whenever the selected product
  // changes. A Sub_category's "current" BOM is read off whichever Product_Code in that group
  // actually has rows saved — in the normal case every code in the group has identical rows (they
  // were all written together by saveBom below), so the first one found is representative.
  //
  // If the group has recently split/been edited unevenly and its codes now carry genuinely
  // different BOMs, this does NOT silently merge or guess — it surfaces the disagreement
  // (setDivergence below) so the user can see and resolve it explicitly, and shows the first
  // match's rows as a starting point only. Saving in this state overwrites EVERY code in the group
  // with whatever's on screen, which is exactly how disagreement gets resolved — confirmed
  // 2026-10-12, this was the known gap being closed rather than left as a silent limitation.
  useEffect(() => {
    if (!selectedProduct) { setRows([]); setDivergence(null); return; }
    const codes = productCodesBySubCategory[selectedProduct] || [];
    const codeSet = new Set(codes);
    const relevant = bom.filter(r => codeSet.has(r.product_code));

    // Fingerprint each code's BOM (sorted sku:qty:cost triples) to detect real disagreement —
    // codes with zero rows are expected (not yet set up) and don't count as a conflicting group.
    const bySignature = new Map();
    const byCode = new Map();
    codes.forEach(code => byCode.set(code, []));
    relevant.forEach(r => byCode.get(r.product_code)?.push(r));
    byCode.forEach((rowsForCode, code) => {
      if (!rowsForCode.length) return;
      const sig = rowsForCode.map(r => `${r.packaging_sku}:${r.qty_per_unit}:${r.cost_override ?? ""}`).sort().join("|");
      (bySignature.get(sig) ?? bySignature.set(sig, []).get(sig)).push(code);
    });
    const sortedGroups = [...bySignature.entries()].sort((a, b) => b[1].length - a[1].length);
    if (sortedGroups.length > 1) {
      setDivergence({ groups: sortedGroups.map(([, codesInGroup]) => codesInGroup), totalCodesWithBom: relevant.length ? new Set(relevant.map(r => r.product_code)).size : 0 });
    } else {
      setDivergence(null);
    }

    // Starting point for the editable grid: the LARGEST agreeing group when codes disagree (most
    // representative of "what most of this product currently has"), otherwise simply whichever
    // code has rows — matches what the divergence banner above tells the user.
    const anchorCode = sortedGroups[0]?.[1]?.[0] ?? relevant[0]?.product_code;
    const existing = relevant
      .filter(r => r.product_code === anchorCode)
      .map(r => ({ _uid: uid(), packaging_sku: r.packaging_sku, qty_per_unit: String(r.qty_per_unit ?? 1), cost_override: r.cost_override != null ? String(r.cost_override) : "", _dirty: false }));
    setRows(existing);
  }, [selectedProduct, bom, productCodesBySubCategory]);

  const addRow = () => setRows(rs => [...rs, { _uid: uid(), packaging_sku: "", qty_per_unit: "1", cost_override: "", _dirty: true }]);
  const removeRow = (id) => setRows(rs => rs.filter(r => r._uid !== id));
  const setRowField = (id, key, val) =>
    setRows(rs => rs.map(r => r._uid === id ? { ...r, [key]: val, _dirty: true } : r));

  const skuByCode = useMemo(() => new Map(skuMaster.map(s => [s.packaging_sku, s])), [skuMaster]);
  const skuOptionsFor = useCallback((currentSku) => {
    const list = skuMaster.filter(s => showInactive || s.is_active || s.packaging_sku === currentSku);
    // Packaging SKUs linked to this specific product float to the top of the list — generic
    // (unlinked) SKUs like Mailer/Polybag sizes stay available for every product below them.
    const linked = list.filter(s => (s.linked_product || "").trim() === selectedProduct);
    const generic = list.filter(s => (s.linked_product || "").trim() !== selectedProduct);
    return [...linked, ...generic];
  }, [skuMaster, selectedProduct, showInactive]);

  // Effective cost for a BOM row: its own override if set, else the master's cost (may be null
  // if the sheet hasn't been filled in for that SKU yet).
  const effectiveCost = (row) => {
    const override = toNum(row.cost_override);
    if (override != null) return override;
    return skuByCode.get(row.packaging_sku)?.cost_per_unit ?? null;
  };

  // ── Define a brand-new packaging SKU inline, same capability the bulk uploader has, for when
  //    a product needs packaging that isn't in the master (Sheet-synced or already-added) yet.
  //    Lands in packaging_sku_master_extra (never the Sheet-synced table, which gets truncated and
  //    reloaded every hourly sync — see schema comment) and is flagged "not in Sheet yet" until
  //    someone adds it to the real Sheet for real.
  const openNewSku = (rowId) => { setNewSkuFor(rowId); setNewSkuForm({ packaging_sku: "", packaging_type: "", packaging_name: "", cost_per_unit: "", _skuTouched: false }); };
  const closeNewSku = () => { setNewSkuFor(null); };

  // Suggest a SKU code from Type + Subtype, following the real master's own naming convention
  // (confirmed 2026-10-12 from the live data: "FR-<initials of the meaningful words>-<TYPE>-PKG",
  // e.g. "Bag - Barefoot Sock Shoe" -> FR-BFSS-BAG-PKG). Only a starting point the user can edit —
  // collisions with an existing SKU are still caught by createNewSku before saving.
  const STOPWORDS_SKU = new Set(["THE", "OF", "FOR", "AND", "A", "AN"]);
  const suggestSku = (type, name) => {
    const words = String(name || "").toUpperCase().replace(/[^A-Z0-9\s]/g, " ").split(/\s+/).filter(w => w && !STOPWORDS_SKU.has(w));
    if (!words.length) return "";
    const initials = words.map(w => w[0]).join("");
    const typeCode = String(type || "").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10);
    return ["FR", initials, typeCode, "PKG"].filter(Boolean).join("-");
  };
  const setNewSkuField = (key, val) => setNewSkuForm(f => {
    const next = { ...f, [key]: val };
    if (key === "packaging_sku") next._skuTouched = true;
    // Only auto-fill the SKU field while the user hasn't hand-edited it themselves — once they've
    // typed into it directly, stop overwriting their input on every Type/Name keystroke.
    if ((key === "packaging_type" || key === "packaging_name") && !f._skuTouched) {
      next.packaging_sku = suggestSku(key === "packaging_type" ? val : f.packaging_type, key === "packaging_name" ? val : f.packaging_name);
    }
    return next;
  });
  const createNewSku = async () => {
    const sku = newSkuForm.packaging_sku.trim();
    const type = newSkuForm.packaging_type.trim();
    const name = newSkuForm.packaging_name.trim();
    if (!sku || !type || !name) { flash("error", "Packaging SKU, Type and Name are all required."); return; }
    if (skuByCode.has(sku)) { flash("error", `"${sku}" already exists in the Packaging SKU Master.`); return; }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const record = { packaging_sku: sku, packaging_type: type, packaging_name: name, cost_per_unit: toNum(newSkuForm.cost_per_unit), added_by: user?.id ?? null };
      const { error } = await supabase.from("packaging_sku_master_extra").upsert([record], { onConflict: "packaging_sku" });
      if (error) throw error;
      setSkuMaster(sm => [...sm, { ...record, vendor: null, linked_product: null, vol_weight_gm: null, is_active: true, _fromSheet: false }]);
      if (newSkuFor) setRowField(newSkuFor, "packaging_sku", sku);
      setNewSkuFor(null);
      flash("ok", `Created new packaging SKU "${sku}" — add it to the Sheet-backed master when you can.`);
    } catch (e) {
      flash("error", `Couldn't create SKU: ${e.message ?? e}`);
    }
  };

  // ── Save this product's BOM ──────────────────────────────────────────────
  const saveBom = async () => {
    if (!selectedProduct) { flash("error", "Select a product first."); return; }
    const valid = rows.filter(r => r.packaging_sku);
    if (rows.length && valid.length !== rows.length) {
      flash("error", "Every row needs a Packaging SKU selected before saving.");
      return;
    }
    // Guard against the same SKU being picked twice for one product (primary key would silently
    // let the second upsert overwrite the first, hiding the duplicate from the user).
    const seen = new Set();
    for (const r of valid) {
      if (seen.has(r.packaging_sku)) { flash("error", "The same Packaging SKU is used twice — remove the duplicate row."); return; }
      seen.add(r.packaging_sku);
    }

    // Fan out to every real Product_Code currently under this Sub_category (confirmed 2026-10-12)
    // — the UI works at the Sub_category level, but packaging_bom is keyed on the stable
    // Product_Code so a later Sheet rename/re-split of Sub_categories can never orphan it. The
    // live grouping from loadAll() (productCodesBySubCategory) is what "which codes get this BOM"
    // means at the moment of saving — if the group has since split, each code still carries
    // whichever Sub_category it belongs to NOW, which is what matters.
    const codes = productCodesBySubCategory[selectedProduct] || [];
    if (!codes.length) { flash("error", `No real Product_Codes found under "${selectedProduct}" — nothing to save against.`); return; }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const batchId = crypto.randomUUID();
      const keptSkus = new Set(valid.map(r => r.packaging_sku));
      const codeSet = new Set(codes);
      const existingForProduct = bom.filter(r => codeSet.has(r.product_code));
      const toDelete = existingForProduct.filter(r => !keptSkus.has(r.packaging_sku));

      if (toDelete.length) {
        // One delete per (code, sku) pair being dropped — batched by chunking the IN-list per SKU
        // rather than one request per row, since a popular Sub_category can have 500+ codes.
        const skusToDelete = [...new Set(toDelete.map(r => r.packaging_sku))];
        for (const sku of skusToDelete) {
          const { error } = await supabase.from("packaging_bom").delete()
            .in("product_code", codes).eq("packaging_sku", sku);
          if (error) throw error;
        }
      }
      if (valid.length) {
        // batch_id/batch_source tag every row this Save writes — confirmed 2026-10-12, this is
        // what lets a mistaken Save (wrong product, wrong SKU, etc.) be found and undone as one
        // action from the Recent Batches panel instead of hunting row by row.
        const records = codes.flatMap(product_code => valid.map(r => ({
          product_code,
          packaging_sku: r.packaging_sku,
          sub_category_at_save: selectedProduct,
          qty_per_unit: r.qty_per_unit !== "" ? Number(r.qty_per_unit) : 1,
          cost_override: toNum(r.cost_override),
          batch_id: batchId,
          batch_source: "form",
          batch_note: selectedProduct,
          batch_created_by: user?.id ?? null,
        })));
        const PAGE = 500;
        for (let i = 0; i < records.length; i += PAGE) {
          const { error } = await supabase.from("packaging_bom").upsert(records.slice(i, i + PAGE), { onConflict: "product_code,packaging_sku" });
          if (error) throw error;
        }
      }
      await loadAll();
      flash("ok", `Saved packaging BOM for "${selectedProduct}" — ${valid.length} material${valid.length !== 1 ? "s" : ""} applied across ${codes.length} product code${codes.length !== 1 ? "s" : ""}.`);
    } catch (e) {
      flash("error", `Save failed: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Download the current BOM as-saved — two sheets, confirmed 2026-10-12 ──
  // Sheet 1 is the Sub_category-wise "intended" view: one row per (Sub_category, Packaging SKU),
  // deduplicated across that group's Product_Codes. Grouping uses the LIVE productCodesBySubCategory
  // (re-derived from BigQuery every page load), not the cached sub_category_at_save column, so a
  // Sub_category rename is reflected here too — same principle as everywhere else on this page.
  // A Sub_category whose codes currently disagree (see the divergence warning above) shows ALL its
  // distinct variants here with a Variant # column, rather than picking one and hiding the rest.
  // Sheet 2 is the Product_Code-wise ground truth: exactly what's in packaging_bom, one row per
  // (Product_Code, Packaging SKU) — the real underlying data, useful as a backup/audit export.
  const downloadCurrentBom = () => {
    if (!bom.length) { alert("No packaging BOM data saved yet — nothing to download."); return; }

    // Build Sub_category-wise sheet by the same fingerprinting logic used for divergence detection.
    const subCatRows = [];
    Object.entries(productCodesBySubCategory).forEach(([subCat, codes]) => {
      const codeSet = new Set(codes);
      const relevant = bom.filter(r => codeSet.has(r.product_code));
      if (!relevant.length) return;
      const byCode = new Map();
      codes.forEach(c => byCode.set(c, []));
      relevant.forEach(r => byCode.get(r.product_code)?.push(r));
      const bySignature = new Map();
      byCode.forEach((rowsForCode, code) => {
        if (!rowsForCode.length) return;
        const sig = rowsForCode.map(r => `${r.packaging_sku}:${r.qty_per_unit}:${r.cost_override ?? ""}`).sort().join("|");
        if (!bySignature.has(sig)) bySignature.set(sig, { codes: [], rows: rowsForCode });
        bySignature.get(sig).codes.push(code);
      });
      const variants = [...bySignature.values()].sort((a, b) => b.codes.length - a.codes.length);
      variants.forEach((variant, vi) => {
        variant.rows.forEach(r => {
          const sku = skuByCode.get(r.packaging_sku);
          subCatRows.push({
            "Sub-category": subCat,
            "Variant #": variants.length > 1 ? vi + 1 : "",
            "Product Codes in this variant": variants.length > 1 ? variant.codes.length : codes.length,
            "Packaging Type": sku?.packaging_type || "",
            "Packaging Subtype / Name": sku?.packaging_name || "",
            "Packaging SKU": r.packaging_sku,
            "Qty per unit": r.qty_per_unit,
            "Cost Override": r.cost_override ?? "",
            "Effective Cost/Unit": effectiveCost(r) ?? "",
            "Not in Sheet yet": sku && !sku._fromSheet ? "Yes" : "",
          });
        });
      });
    });

    // Product_Code-wise ground truth, straight off the bom state.
    const codeRows = [...bom]
      .sort((a, b) => a.product_code.localeCompare(b.product_code) || a.packaging_sku.localeCompare(b.packaging_sku))
      .map(r => {
        const sku = skuByCode.get(r.packaging_sku);
        return {
          "Product Code": r.product_code,
          "Sub-category (current)": Object.entries(productCodesBySubCategory).find(([, codes]) => codes.includes(r.product_code))?.[0] || r.sub_category_at_save || "",
          "Sub-category (at time of save)": r.sub_category_at_save || "",
          "Packaging Type": sku?.packaging_type || "",
          "Packaging Subtype / Name": sku?.packaging_name || "",
          "Packaging SKU": r.packaging_sku,
          "Qty per unit": r.qty_per_unit,
          "Cost Override": r.cost_override ?? "",
          "Effective Cost/Unit": effectiveCost(r) ?? "",
          "Saved By Batch": r.batch_source === "bulk_upload" ? `Bulk Upload (${r.batch_note || ""})` : r.batch_source === "form" ? "Form" : "",
          "Last Updated": r.updated_at ? new Date(r.updated_at).toLocaleString() : "",
        };
      });

    const wb = XLSX.utils.book_new();
    const styleHeader = (ws, ncols) => {
      for (let c = 0; c < ncols; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[addr]) ws[addr].s = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 }, fill: { patternType: "solid", fgColor: { rgb: "1F5C4A" } } };
      }
    };

    const ws1 = XLSX.utils.json_to_sheet(subCatRows);
    ws1["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
    styleHeader(ws1, 10);
    if (subCatRows.length) ws1["!autofilter"] = { ref: `A1:J${subCatRows.length + 1}` };
    XLSX.utils.book_append_sheet(wb, ws1, "By Sub-category");

    const ws2 = XLSX.utils.json_to_sheet(codeRows);
    ws2["!cols"] = [{ wch: 16 }, { wch: 30 }, { wch: 30 }, { wch: 16 }, { wch: 30 }, { wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 20 }];
    styleHeader(ws2, 11);
    if (codeRows.length) ws2["!autofilter"] = { ref: `A1:K${codeRows.length + 1}` };
    XLSX.utils.book_append_sheet(wb, ws2, "By Product Code");

    XLSX.writeFile(wb, `packaging_bom_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ── Bulk uploader — same shape as the form, one row per (Product, Packaging SKU) ──
  const downloadTemplate = () => {
    const headerRow = ["Product *", "Packaging SKU *", "Packaging Type (new SKU only)", "Packaging Name (new SKU only)", "Qty per unit", "Cost Override"];
    const ex1 = products[0] && skuMaster[0] ? [products[0], skuMaster[0].packaging_sku, "", "", "1", ""] : ["Car Neck Pillow", "FR-9-13-MAILER-PKG", "", "", "1", ""];
    const ex2 = ["(example: brand-new SKU not yet in the master)", "FR-NEW-EXAMPLE-PKG", "Mailer", "Mailer 10x14 (example)", "1", "8.50"];
    const ws = XLSX.utils.aoa_to_sheet([headerRow, ex1, ex2]);
    ws["!cols"] = [{ wch: 30 }, { wch: 26 }, { wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 14 }];
    headerRow.forEach((_, c) => {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[addr]) ws[addr].s = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
        fill: { patternType: "solid", fgColor: { rgb: "1F5C4A" } },
      };
    });
    const instrData = [
      ["Column", "Required?", "Description"],
      ["Product", "YES", "Must exactly match a product sub-category (e.g. \"Car Neck Pillow\") — see the Product dropdown on the page, or the \"Valid Products\" sheet, for valid names."],
      ["Packaging SKU", "YES", "An existing SKU from the \"Packaging SKU Master\" sheet (copy it from there), OR a brand-new SKU code you're defining right now — see below."],
      ["Packaging Type (new SKU only)", "only for a new SKU", "Required ONLY if the Packaging SKU isn't in the master yet. The type/category of the new packaging item (e.g. \"Mailer\", \"Polybag\", \"Corrugation Box\")."],
      ["Packaging Name (new SKU only)", "only for a new SKU", "Required ONLY if the Packaging SKU isn't in the master yet. A descriptive name for the new packaging item."],
      ["Qty per unit", "no", "Defaults to 1 if left blank."],
      ["Cost Override", "no", "₹ per unit for THIS product only, overriding the SKU master's own cost. Leave blank to use the master's cost (if set). For a brand-new SKU, this also becomes that SKU's starting cost in the master."],
      [""],
      ["NEW SKUs — WHAT HAPPENS ON UPLOAD"],
      ["If a Packaging SKU isn't found in the master, it will be created automatically (using the Packaging Type, Packaging Name and Cost Override you provide) so it's immediately usable in this and future BOMs."],
      ["It's flagged on the page as \"not in Sheet yet\" until it's also added to the real Packaging SKU Master Sheet — do that afterwards so the master stays the single source of truth and the hourly sync doesn't lose track of it."],
      [""],
      ["Notes"],
      ["1. One row = one (Product, Packaging SKU) pair. A product needing multiple packaging items needs multiple rows."],
      ["2. Re-uploading the same Product + Packaging SKU will UPDATE that record (upsert), not duplicate it."],
      ["3. A Product can only list the same Packaging SKU once — don't repeat a SKU for one product."],
      ["4. See the \"Packaging SKU Master\" sheet in this file for the full current list of valid SKUs to copy from."],
    ];
    const notes = XLSX.utils.aoa_to_sheet(instrData);
    notes["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 95 }];

    // Reference sheet — the current Packaging SKU Master (type, name, SKU, cost if known), so the
    // user can see/copy valid values instead of guessing or re-typing codes from memory (the whole
    // point of this request: give the uploader some "easiness" instead of a blind free-text field).
    const skuRefHeader = ["Packaging Type", "Packaging Name", "Packaging SKU", "Cost Per Unit", "In Sheet?"];
    const skuRefRows = [...skuMaster]
      .sort((a, b) => (a.packaging_type || "").localeCompare(b.packaging_type || "") || (a.packaging_name || "").localeCompare(b.packaging_name || ""))
      .map(s => [s.packaging_type || "", s.packaging_name || "", s.packaging_sku, s.cost_per_unit ?? "", s._fromSheet ? "Yes" : "No (added via uploader)"]);
    const skuRefWs = XLSX.utils.aoa_to_sheet([skuRefHeader, ...skuRefRows]);
    skuRefWs["!cols"] = [{ wch: 20 }, { wch: 34 }, { wch: 30 }, { wch: 14 }, { wch: 20 }];
    skuRefHeader.forEach((_, c) => {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (skuRefWs[addr]) skuRefWs[addr].s = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 }, fill: { patternType: "solid", fgColor: { rgb: "1F5C4A" } } };
    });
    skuRefWs["!autofilter"] = { ref: `A1:E${skuRefRows.length + 1}` };

    // Reference sheet — valid product names, same purpose as above.
    const prodRefWs = XLSX.utils.aoa_to_sheet([["Product (Sub-category)"], ...products.map(p => [p])]);
    prodRefWs["!cols"] = [{ wch: 34 }];
    if (prodRefWs.A1) prodRefWs.A1.s = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 }, fill: { patternType: "solid", fgColor: { rgb: "1F5C4A" } } };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Packaging BOM");
    XLSX.utils.book_append_sheet(wb, notes, "Instructions");
    XLSX.utils.book_append_sheet(wb, skuRefWs, "Packaging SKU Master");
    XLSX.utils.book_append_sheet(wb, prodRefWs, "Valid Products");
    XLSX.writeFile(wb, "packaging_bom_template.xlsx");
  };

  const importTemplate = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadProgress({ parsing: true });
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await new Promise(r => setTimeout(r, 30));
        const wb = XLSX.read(reader.result, { type: "array" });
        const wsName = wb.SheetNames.find(n => /bom|packaging/i.test(n)) ?? wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
        if (!aoa.length) throw new Error("Empty sheet");

        const normHead = c => String(c ?? "").trim().toLowerCase().replace(/\s*\*\s*$/, "").replace(/\s*\(new sku only\)\s*$/, "");
        const head = aoa[0].map(normHead);
        const ci = {
          product: head.indexOf("product"),
          sku: head.indexOf("packaging sku"),
          newType: head.indexOf("packaging type"),
          newName: head.indexOf("packaging name"),
          qty: head.indexOf("qty per unit"),
          cost: head.indexOf("cost override"),
        };
        if (ci.product === -1 || ci.sku === -1) {
          throw new Error("Couldn't find header row with 'Product', 'Packaging SKU' columns. Use the downloaded template.");
        }

        const productSet = new Set(products.map(p => p.trim().toUpperCase()));
        const skuMap = new Map(skuMaster.map(s => [s.packaging_sku.trim().toUpperCase(), s]));

        const body = aoa.slice(1);
        const good = [], bad = [], newSkus = [];
        const newSkuSeen = new Map(); // upper SKU -> the row that first defined it, to catch conflicting re-definitions in one file
        body.forEach((row, i) => {
          const product = String(row[ci.product] ?? "").trim();
          const sku = String(row[ci.sku] ?? "").trim();
          const newType = ci.newType !== -1 ? String(row[ci.newType] ?? "").trim() : "";
          const newName = ci.newName !== -1 ? String(row[ci.newName] ?? "").trim() : "";
          const qtyRaw = ci.qty !== -1 ? row[ci.qty] : "";
          const costRaw = ci.cost !== -1 ? row[ci.cost] : "";
          if (!product && !sku) return; // blank row

          const missing = [];
          if (!product) missing.push("Product");
          if (!sku) missing.push("Packaging SKU");
          if (missing.length) { bad.push({ line: i + 2, reason: `missing ${missing.join(", ")}` }); return; }

          if (!productSet.has(product.toUpperCase())) {
            bad.push({ line: i + 2, reason: `Product "${product}" not found in item master` });
            return;
          }

          const existingSku = skuMap.get(sku.toUpperCase());
          if (!existingSku) {
            // Not in the master (Sheet-synced or already-added-extra) — this row is defining a
            // brand-new packaging SKU inline, which needs Packaging Type + Packaging Name to do so.
            if (!newType || !newName) {
              bad.push({ line: i + 2, reason: `Packaging SKU "${sku}" doesn't exist yet — provide Packaging Type and Packaging Name to create it, or fix the SKU code` });
              return;
            }
            const key = sku.toUpperCase();
            const prior = newSkuSeen.get(key);
            if (prior && (prior.type !== newType || prior.name !== newName)) {
              bad.push({ line: i + 2, reason: `New Packaging SKU "${sku}" was already defined differently at row ${prior.line} in this file — use one consistent Type/Name for a given SKU` });
              return;
            }
            if (!prior) {
              newSkuSeen.set(key, { line: i + 2, type: newType, name: newName });
              newSkus.push({ packaging_sku: sku, packaging_type: newType, packaging_name: newName, cost_per_unit: toNum(costRaw) });
            }
          }

          good.push({ product, packaging_sku: sku, qty: qtyRaw !== "" ? Number(qtyRaw) : 1, cost: toNum(costRaw) });
        });

        if (bad.length) {
          const preview = bad.slice(0, 8).map(b => `• row ${b.line}: ${b.reason}`).join("\n");
          if (!confirm(`${bad.length} row(s) will be skipped:\n\n${preview}\n\nImport ${good.length} valid rows?`)) return;
        }
        if (!good.length) { alert("No valid rows found."); return; }

        // Duplicate (product, packaging_sku) guard within the file itself — last one would
        // silently win on upsert otherwise, hiding a real data-entry mistake from the uploader.
        const seen = new Map();
        for (const g of good) {
          const key = `${g.product}::${g.packaging_sku}`;
          if (seen.has(key)) {
            alert(`"${g.product}" lists Packaging SKU "${g.packaging_sku}" more than once in this file — fix the duplicate and re-upload.`);
            return;
          }
          seen.set(key, true);
        }

        if (newSkus.length) {
          const preview = newSkus.slice(0, 8).map(s => `• ${s.packaging_sku} — ${s.packaging_type} / ${s.packaging_name}`).join("\n");
          const more = newSkus.length > 8 ? `\n…and ${newSkus.length - 8} more` : "";
          if (!confirm(`${newSkus.length} brand-new Packaging SKU(s) not in the master will be created:\n\n${preview}${more}\n\nThey'll be usable immediately but flagged "not in Sheet yet" until added to the real Packaging SKU Master Sheet. Continue?`)) return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        // One batch_id for the whole file — confirmed 2026-10-12, this is what lets a mistaken
        // bulk upload (wrong file, wrong column mapping, etc.) be found and undone as one action
        // from the Recent Batches panel instead of hunting row by row across however many
        // Sub_categories/Product_Codes it touched.
        const batchId = crypto.randomUUID();
        // Fan out each (Product/Sub_category, SKU) row in the file to every real Product_Code
        // currently under that Sub_category — same reasoning as the single-product form's saveBom.
        const records = good.flatMap(g => {
          const codes = productCodesBySubCategory[g.product] || [];
          return codes.map(product_code => ({
            product_code,
            packaging_sku: g.packaging_sku,
            sub_category_at_save: g.product,
            qty_per_unit: g.qty,
            cost_override: g.cost,
            batch_id: batchId,
            batch_source: "bulk_upload",
            batch_note: file.name,
            batch_created_by: user?.id ?? null,
          }));
        });

        setUploadProgress({ done: 0, total: records.length });
        await new Promise(r => setTimeout(r, 20));

        if (newSkus.length) {
          const { error: newSkuErr } = await supabase.from("packaging_sku_master_extra").upsert(
            newSkus.map(s => ({ ...s, added_by: user?.id ?? null })),
            { onConflict: "packaging_sku" }
          );
          if (newSkuErr) throw newSkuErr;
        }

        const PAGE = 500;
        let done = 0;
        for (let i = 0; i < records.length; i += PAGE) {
          const chunk = records.slice(i, i + PAGE);
          const { error } = await supabase.from("packaging_bom").upsert(chunk, { onConflict: "product_code,packaging_sku" });
          if (error) throw error;
          done += chunk.length;
          setUploadProgress({ done, total: records.length });
        }

        await loadAll();
        setUploadProgress({ done: records.length, total: records.length, finished: true });
        flash("ok", `Uploaded ${records.length} packaging BOM row${records.length !== 1 ? "s" : ""}${newSkus.length ? ` (${newSkus.length} new SKU${newSkus.length !== 1 ? "s" : ""} created — add ${newSkus.length !== 1 ? "them" : "it"} to the Sheet when you can)` : ""}.`);
        setTimeout(() => setUploadProgress(null), 4000);
      } catch (err) {
        setUploadProgress(null);
        alert(`Upload failed: ${err.message ?? err}`);
      } finally {
        if (fileInput.current) fileInput.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // A Sub_category "has a BOM" if ANY of its current Product_Codes has a saved row — using "any"
  // rather than "all" so a group that's only partially filled in still shows as started, not blank.
  const productsWithBom = useMemo(() => {
    const codesWithBom = new Set(bom.map(r => r.product_code));
    return new Set(Object.entries(productCodesBySubCategory)
      .filter(([, codes]) => codes.some(c => codesWithBom.has(c)))
      .map(([subCat]) => subCat));
  }, [bom, productCodesBySubCategory]);

  // Recent batches — every Save or bulk upload tags its rows with one shared batch_id (see
  // saveBom/importTemplate), so grouping the loaded bom rows by batch_id reconstructs "what did
  // this one action write" without a separate table or query. Lets a mistaken upload or save be
  // spotted and undone as one action instead of hunting row by row (confirmed 2026-10-12).
  const recentBatches = useMemo(() => {
    const byBatch = new Map();
    bom.forEach(r => {
      if (!r.batch_id) return; // rows from before batch tracking was added — nothing to group
      if (!byBatch.has(r.batch_id)) {
        byBatch.set(r.batch_id, { batch_id: r.batch_id, source: r.batch_source, note: r.batch_note, updated_at: r.updated_at, rowCount: 0, productCodes: new Set(), skus: new Set() });
      }
      const b = byBatch.get(r.batch_id);
      b.rowCount++;
      b.productCodes.add(r.product_code);
      b.skus.add(r.packaging_sku);
      if (r.updated_at > b.updated_at) b.updated_at = r.updated_at;
    });
    return [...byBatch.values()].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 15);
  }, [bom]);

  const undoBatch = async (batchId) => {
    const batch = recentBatches.find(b => b.batch_id === batchId);
    if (!batch) return;
    if (!confirm(`Undo this ${batch.source === "bulk_upload" ? "bulk upload" : "save"}? This will delete ${batch.rowCount} packaging BOM row${batch.rowCount !== 1 ? "s" : ""} across ${batch.productCodes.size} product code${batch.productCodes.size !== 1 ? "s" : ""}. This cannot be undone itself.`)) return;
    try {
      const { error } = await supabase.from("packaging_bom").delete().eq("batch_id", batchId);
      if (error) throw error;
      await loadAll();
      flash("ok", `Undone — ${batch.rowCount} row${batch.rowCount !== 1 ? "s" : ""} removed.`);
    } catch (e) {
      flash("error", `Undo failed: ${e.message ?? e}`);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 10, color: C.t3 }}>
      <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: 13 }}>Loading packaging BOM…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  return (
    <div style={{ padding: '24px 32px 48px', minHeight: '100vh', background: C.bg, color: C.t1, fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        {onBack && (
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.card, border: `1.5px solid ${C.accent}`, color: C.accent, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: '6px 12px', borderRadius: 20, marginBottom: 10 }}>
            <ArrowLeft size={14} /> Back to Documents
          </button>
        )}
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Documents</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.t1, letterSpacing: -0.5 }}>Packaging BOM</div>
        <p style={{ fontSize: 12.5, color: C.t3, marginTop: 6, maxWidth: 640 }}>
          Define which packaging materials go into each product. One product = one set of material rows (Corr Box, Poly Bag, Mailer, etc.), each pointing at the specific sub-type used for that product.
        </p>
      </div>

      {status && (
        <div style={{ fontSize: 12.5, padding: '8px 12px', borderRadius: 8, marginBottom: 14, border: `1px solid ${status.kind === 'error' ? '#FCA5A5' : '#BBF7D0'}`, background: status.kind === 'error' ? '#FEF2F2' : '#F0FDF4', color: status.kind === 'error' ? C.red : C.accent }}>
          {status.text}
        </div>
      )}

      {/* Upload progress */}
      {uploadProgress && (
        <div style={{ margin: '0 0 14px 0', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1E40AF' }}>
              {uploadProgress.finished ? `✓ Upload complete — ${uploadProgress.total.toLocaleString()} rows saved`
                : uploadProgress.parsing ? `⏳ Parsing file…`
                : `⬆ Uploading… ${uploadProgress.done.toLocaleString()} / ${uploadProgress.total.toLocaleString()}`}
            </span>
          </div>
          <div style={{ height: 8, background: '#DBEAFE', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#2563EB', borderRadius: 99, width: uploadProgress.total ? `${(uploadProgress.done / uploadProgress.total) * 100}%` : '30%', transition: 'width 0.3s ease' }} />
          </div>
        </div>
      )}

      {/* Bulk uploader / downloader */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button style={ghostBtn} onClick={downloadTemplate}><FileSpreadsheet size={13} /> Template</button>
        <button style={ghostBtn} onClick={() => fileInput.current?.click()}><Upload size={13} /> Bulk Upload</button>
        <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={importTemplate} style={{ display: 'none' }} />
        <button style={ghostBtn} onClick={downloadCurrentBom}><Download size={13} /> Download Current BOM</button>
        <span style={{ fontSize: 11, color: C.t3 }}>Upload many products at once, or download everything saved so far — one file, "By Sub-category" and "By Product Code" sheets.</span>
      </div>

      {/* Product picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: C.t2 }}>Product</label>
        <SearchableSelect
          value={selectedProduct}
          onChange={setSelectedProduct}
          placeholder="Select a product…"
          style={{ minWidth: 280 }}
          options={products.map(p => ({ value: p, label: p }))}
          renderOption={o => <>{o.label}{productsWithBom.has(o.value) ? <span style={{ color: C.accent, fontWeight: 700 }}> ✓</span> : null}</>}
        />
        <span style={{ fontSize: 11, color: C.t3 }}>{productsWithBom.size} of {products.length} products have a BOM set up</span>
      </div>

      {selectedProduct && divergence && (
        <div style={{ fontSize: 12.5, padding: '10px 14px', borderRadius: 8, marginBottom: 14, border: '1px solid #FCA5A5', background: '#FEF2F2', color: C.red }}>
          <b>⚠ This product's codes disagree.</b> "{selectedProduct}"'s {productCodesBySubCategory[selectedProduct]?.length ?? 0} product codes carry {divergence.groups.length} different packaging setups
          {" "}({divergence.groups.map(g => `${g.length} code${g.length !== 1 ? "s" : ""}`).join(" vs. ")}) — likely from a Sub_category rename/split after only some codes were updated.
          The rows below are loaded from the largest group as a starting point. Saving now will apply them to <b>every</b> code in this product, overwriting the disagreement. Review before saving, or edit specific codes individually if they're meant to stay different (not supported on this page yet — contact an admin).
        </div>
      )}

      {selectedProduct && (
        <>
          {/* Material rows */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.card, padding: 16, marginBottom: 16 }}>
            {rows.length === 0 && (
              <div style={{ fontSize: 13, color: C.t3, marginBottom: 12 }}>No packaging added yet for "{selectedProduct}".</div>
            )}
            {rows.map(r => {
              const sku = skuByCode.get(r.packaging_sku);
              const cost = effectiveCost(r);
              const hasOverride = toNum(r.cost_override) != null;
              const masterHasCost = sku?.cost_per_unit != null;
              return (
                <div key={r._uid}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <SearchableSelect
                    value={r.packaging_sku}
                    onChange={v => setRowField(r._uid, "packaging_sku", v)}
                    placeholder="Packaging SKU…"
                    style={{ minWidth: 260 }}
                    options={skuOptionsFor(r.packaging_sku).map(s => ({ value: s.packaging_sku, label: `${s.packaging_name} (${s.packaging_sku})` }))}
                    renderOption={o => {
                      const s = skuByCode.get(o.value);
                      return <>
                        <span style={{ fontWeight: 500 }}>{s?.packaging_name}</span>
                        <span style={{ color: C.t3 }}> — {s?.packaging_type} · {o.value}</span>
                        {s?.linked_product === selectedProduct && <span style={{ color: C.accent, fontWeight: 600 }}> · linked</span>}
                        {s && !s._fromSheet && <span style={{ color: "#B8860B", fontWeight: 600 }} title="Added here, not yet in the Sheet-backed Packaging SKU Master"> · not in Sheet yet</span>}
                      </>;
                    }}
                    onAddNew={(typed) => {
                      // Whatever the user typed in the SKU search box is almost always a
                      // description (e.g. "Barefoot Sock Shoe"), not an actual SKU code — seed it
                      // into Subtype instead, which immediately triggers the SKU auto-suggestion.
                      openNewSku(r._uid);
                      if (typed) setNewSkuField("packaging_name", typed);
                    }}
                    addNewLabel="Add new packaging SKU…"
                  />

                  <input type="number" step="0.01" value={r.qty_per_unit} onChange={e => setRowField(r._uid, "qty_per_unit", e.target.value)}
                    placeholder="Qty" style={{ ...selectStyle, minWidth: 70, width: 70, textAlign: 'right' }} />
                  <span style={{ fontSize: 11, color: C.t3 }}>per unit</span>

                  <input type="number" step="0.01" value={r.cost_override}
                    onChange={e => setRowField(r._uid, "cost_override", e.target.value)}
                    placeholder={masterHasCost ? `₹${sku.cost_per_unit}` : "₹ cost"}
                    title={masterHasCost ? "Overrides the SKU master's cost for this product only" : "SKU master has no cost yet — enter one here"}
                    style={{ ...selectStyle, minWidth: 90, width: 90, textAlign: 'right', borderColor: hasOverride ? C.accent : C.border }} />
                  <span style={{ fontSize: 11, color: C.t3 }}>
                    {hasOverride ? `override, effective ₹${cost.toFixed(2)}/unit` : masterHasCost ? `master ₹${cost.toFixed(2)}/unit` : "no cost set"}
                  </span>

                  <button onClick={() => removeRow(r._uid)}
                    style={{ background: 'transparent', border: 'none', color: '#C4483A', cursor: 'pointer', padding: 4, borderRadius: 4, marginLeft: 'auto' }}>
                    <Trash2 size={14} />
                  </button>
                </div>

                {newSkuFor === r._uid && (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap', background: '#FAF8F2', border: `1px dashed ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', marginBottom: 4 }}>Type *</div>
                      <input value={newSkuForm.packaging_type} onChange={e => setNewSkuField("packaging_type", e.target.value)}
                        placeholder="e.g. Mailer" style={{ ...selectStyle, minWidth: 130 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', marginBottom: 4 }}>Subtype / Name *</div>
                      <input value={newSkuForm.packaging_name} onChange={e => setNewSkuField("packaging_name", e.target.value)}
                        placeholder="e.g. Mailer 10x14" style={{ ...selectStyle, minWidth: 180 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', marginBottom: 4 }}>
                        SKU * {!newSkuForm._skuTouched && newSkuForm.packaging_sku && <span style={{ color: C.accent, fontWeight: 400, textTransform: 'none' }}>(suggested)</span>}
                      </div>
                      <input value={newSkuForm.packaging_sku} onChange={e => setNewSkuField("packaging_sku", e.target.value)}
                        placeholder="auto-suggested from Type + Subtype" style={{ ...selectStyle, minWidth: 190, fontFamily: 'monospace', fontSize: 12.5 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', marginBottom: 4 }}>Cost / Unit</div>
                      <input type="number" step="0.01" value={newSkuForm.cost_per_unit} onChange={e => setNewSkuField("cost_per_unit", e.target.value)}
                        placeholder="₹ optional" style={{ ...selectStyle, minWidth: 100 }} />
                    </div>
                    <button style={primaryBtn} onClick={createNewSku}>Create & use</button>
                    <button style={ghostBtn} onClick={closeNewSku}>Cancel</button>
                    <div style={{ fontSize: 11, color: C.t3, width: '100%' }}>SKU is auto-suggested as you type Type/Subtype, following the master's own naming pattern — edit it freely before creating. This item will be usable right away, flagged "not in Sheet yet" until it's also added to the real Packaging SKU Master Sheet.</div>
                  </div>
                )}
                </div>
              );
            })}

            <button style={{ ...ghostBtn, marginTop: 4 }} onClick={addRow}><Plus size={13} /> Add packaging</button>

            {rows.length > 0 && (() => {
              const totalCost = rows.reduce((s, r) => s + (effectiveCost(r) ?? 0) * (toNum(r.qty_per_unit) ?? 0), 0);
              const totalWeight = rows.reduce((s, r) => s + (skuByCode.get(r.packaging_sku)?.vol_weight_gm ?? 0) * (toNum(r.qty_per_unit) ?? 0), 0);
              const missingCost = rows.filter(r => r.packaging_sku && effectiveCost(r) == null);
              return (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.06em' }}>Total Packaging Cost / unit</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.t1 }}>₹{totalCost.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.06em' }}>Total Packaging Weight</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.t1 }}>{totalWeight.toFixed(0)} g</div>
                  </div>
                  {missingCost.length > 0 && (
                    <div style={{ fontSize: 11.5, color: C.red, alignSelf: 'center' }}>
                      ⚠ {missingCost.length} line{missingCost.length !== 1 ? "s" : ""} missing cost — total above is understated.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }} onClick={saveBom} disabled={saving}>
              <Save size={13} /> {saving ? "Saving…" : "Save BOM"}
            </button>
            <button style={ghostBtn} onClick={loadAll}><RefreshCw size={13} /> Reload</button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.t3, marginLeft: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              Show inactive SKUs in picker
            </label>
          </div>
        </>
      )}

      {recentBatches.length > 0 && (
        <div style={{ marginTop: 28, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t2, marginBottom: 10 }}>Recent Batches</div>
          <div style={{ fontSize: 11.5, color: C.t3, marginBottom: 10 }}>
            Every Save or Bulk Upload is tracked as one batch here. If something was added by mistake — wrong product, wrong file — undo the whole batch in one click instead of fixing rows one by one.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentBatches.map(b => (
              <div key={b.batch_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: b.source === "bulk_upload" ? '#E8F0FB' : '#EAF1EC', color: b.source === "bulk_upload" ? '#2A5C9E' : C.accent, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                  {b.source === "bulk_upload" ? "Bulk Upload" : "Form Save"}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{b.note || "(untitled)"}</span>
                <span style={{ fontSize: 11.5, color: C.t3 }}>{b.rowCount} row{b.rowCount !== 1 ? "s" : ""} · {b.productCodes.size} product code{b.productCodes.size !== 1 ? "s" : ""} · {b.skus.size} SKU{b.skus.size !== 1 ? "s" : ""}</span>
                <span style={{ fontSize: 11, color: C.t3 }}>{b.updated_at ? new Date(b.updated_at).toLocaleString() : ""}</span>
                <button onClick={() => undoBatch(b.batch_id)} style={{ ...ghostBtn, marginLeft: 'auto', color: '#C4483A', borderColor: '#F3C9C2' }}>
                  <Trash2 size={13} /> Undo
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
