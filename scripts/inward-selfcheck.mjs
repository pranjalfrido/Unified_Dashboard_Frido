// Offline checks for Inventory → Inward (no credentials, no network):
//   node scripts/inward-selfcheck.mjs
// 1. aggregation: totals reconcile to the input rows, filters, previous period
// 2. SKU key: the SQL sales-key expression mirrors parseFinalSku + normSku
// 3. estimated stock rebuild
// 4. server-side permission check (authorizeInward) against a fake Supabase client
import assert from 'node:assert/strict'
import { buildInwardPayload, periods, SKU_GRN_SQL, VENDOR_GRN_SQL, SUBCAT_GRN_SQL, GRN_SQL, normaliseFilters, buildLastGrnDays, buildVendorSkusSupplied, DQ_UNMAPPED_SKU_DETAIL_SQL, DQ_UNMAPPED_VENDOR_DETAIL_SQL } from '../api/_inward_core.js'
import { parseFinalSku, normSku } from '../api/_inventory_shared.js'
import { authorizeInward } from '../api/inward.js'
import { estimateStock, rollup, autoGrain, warehouseStock, attachStock, stockIndex, toTsv, toCsv, thisMonthRange } from '../src/inventory/inwardUtils.js'

let passed = 0
const ok = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }

// Facility reference rows (inline so the check doesn't depend on api/data snapshots).
const refRows = {
  facilityRows: [{ Facility: 'Vadgaon_OPS', Location: 'PNQ' }, { Facility: 'Hexalog_GGN2', Location: 'GGN' }],
  channelRows: [], regionRows: [],
}
const range = periods('2026-10-01', '2026-10-31')
const grnRows = [
  // current period
  { d: '2026-10-02', g: 'G1', f: 'Vadgaon_OPS', v: 'Acme', t: 'Domestic', s: 'FR-A1', c: 'Insoles', sc: 'Gel Insole', n: 'Gel', q: 100, r: 5 },
  { d: '2026-10-02', g: 'G1', f: 'Vadgaon_OPS', v: 'Acme', t: 'Domestic', s: 'FR-B1', c: 'Cushions', sc: 'Seat Cushion', n: 'Seat', q: 50, r: 0 },
  { d: '2026-10-10', g: 'G2', f: 'Hexalog_GGN2', v: 'Far East', t: 'Import', s: 'FR-A1', c: 'Insoles', sc: 'Gel Insole', n: 'Gel', q: 400, r: 0 },
  { d: '2026-10-20', g: 'G3', f: 'Hexalog_GGN2', v: 'Frido Plant', t: 'Inhouse', s: 'FR-C1', c: 'Cushions', sc: 'Seat Cushion', n: 'Seat2', q: 30, r: 0 },
  { d: '2026-10-21', g: 'G4', f: 'Vadgaon_OPS', v: 'Acme', t: 'Domestic', s: 'FR-A1', c: 'Insoles', sc: 'Gel Insole', n: 'Gel', q: 20, r: 0 },
  // Internal (intra-company transfer) row — must never affect any number on this page. GRN_SQL
  // excludes it at the SQL layer; this row exercises buildInwardPayload's own defense-in-depth drop.
  { d: '2026-10-15', g: 'G5', f: 'Vadgaon_OPS', v: 'Frido Warehouse Transfer', t: 'Internal', s: 'FR-A1', c: 'Insoles', sc: 'Gel Insole', n: 'Gel', q: 9999, r: 0 },
  // previous period (Sep)
  { d: '2026-09-15', g: 'G0', f: 'Vadgaon_OPS', v: 'Acme', t: 'Domestic', s: 'FR-A1', c: 'Insoles', sc: 'Gel Insole', n: 'Gel', q: 300, r: 0 },
]
const salesRows = [
  { d: '2026-10-05', k: 'FR-A1', f: 'Vadgaon_OPS', q: 200 },
  { d: '2026-10-06', k: 'FR-B1', f: 'Hexalog_GGN2', q: 25 },
  { d: '2026-09-20', k: 'FR-A1', f: 'Vadgaon_OPS', q: 100 },
  { d: '2026-10-07', k: 'COUP500', f: 'Vadgaon_OPS', q: 999 },          // pseudo SKU → ignored
  { d: '2026-10-08', k: 'FR-ZZ9', f: 'Vadgaon_OPS', q: 999 },           // not in master → ignored
]
const masterRows = [
  { code: 'FR-A1', category: 'Insoles', sub_category: 'Gel Insole', name: 'Gel', type: null },
  { code: 'FR-B1', category: 'Cushions', sub_category: 'Seat Cushion', name: 'Seat', type: null },
  { code: 'FR-C1', category: 'Cushions', sub_category: 'Seat Cushion', name: 'Seat2', type: null },
  // Never inwarded (no grnRows, no lastSkuRows) — exists only to prove the Product master table
  // lists every SKU master row, not just ones with inward activity.
  { code: 'FR-D1', category: 'Mobility', sub_category: 'Walking Stick', name: 'Stick', type: null },
]
// Earliest-ever inward date per SKU (FIRST_SKU_SQL rows): FR-A1 long-standing (first seen well
// before Oct, in the Sep row above) → not new. FR-B1 first seen inside Oct → new. FR-C1 first seen
// before Oct (e.g. an earlier, out-of-fixture GRN) despite only appearing in Oct's grnRows here →
// not new. This is the case the "all-time" definition exists for: a SKU present in the selected
// range's rows isn't automatically "new" just because it has no row in the *previous* period.
const firstSkuRows = [
  { s: 'FR-A1', d: '2026-09-15' },
  { s: 'FR-B1', d: '2026-10-02' },
  { s: 'FR-C1', d: '2026-08-01' },
]
// Latest-ever inward per SKU (LAST_SKU_SQL rows), full history — drives the Product master
// table's Last inward columns. FR-A1 has two vendors on its actual last date (Oct-21, from
// grnRows above) so both must surface; FR-D1 isn't in grnRows at all (never inwarded in this
// fixture's current OR previous period) and still needs a master-table row, just with no last
// inward — this is the exact gap the table exists to cover.
const lastSkuRows = [
  { s: 'FR-A1', d: '2026-10-21', q: 20, v: 'Acme' },
  { s: 'FR-A1', d: '2026-10-21', q: 15, v: 'Far East' },
  { s: 'FR-B1', d: '2026-10-02', q: 50, v: 'Acme' },
  { s: 'FR-C1', d: '2026-10-20', q: 30, v: 'Frido Plant' },
]
const build = (filters = {}, isAdmin = false) => buildInwardPayload({ grnRows, salesRows, masterRows, skuMapRows: [], firstSkuRows, lastSkuRows, dqRows: [], refRows, range, filters: normaliseFilters(filters), isAdmin })

console.log('1. aggregation')
const p = build()
ok('period windows: Oct vs Sep (same 31 days ending the day before)', () => { assert.equal(range.prevStart, '2026-08-31'); assert.equal(range.prevEnd, '2026-09-30'); assert.equal(range.days, 31) })
ok('inward units = sum of current-period GRN quantities', () => assert.equal(p.kpis.cur.units, 100 + 50 + 400 + 30 + 20))
ok('previous-period units', () => assert.equal(p.kpis.prev.units, 300))
ok('GRNs / SKUs / vendors are distinct counts', () => { assert.equal(p.kpis.cur.grns, 4); assert.equal(p.kpis.cur.skus, 3); assert.equal(p.kpis.cur.vendors, 3) })
ok('rejection % = rejected ÷ (received + rejected), current and previous period', () => {
  assert.ok(Math.abs(p.kpis.cur.rejectionPct - (5 / (600 + 5)) * 100) < 1e-9)   // 600 = 100+50+400+30+20, 5 rejected (G1)
  assert.equal(p.kpis.prev.rejectionPct, 0)                                     // Sep row has 0 rejected
})
ok('new SKUs = first-ever inward date (not just "missing last period") falls in [start, end]', () => {
  // FR-A1: first seen Sep-15 → not new. FR-B1: first seen Oct-02 (inside range) → new.
  // FR-C1: first seen Aug-01, despite only appearing in Oct's grnRows fixture → not new.
  assert.equal(p.kpis.cur.newSkus, 1)
  const noFirstSku = buildInwardPayload({ grnRows, salesRows, masterRows, skuMapRows: [], dqRows: [], refRows, range, filters: normaliseFilters({}), isAdmin: false })
  assert.equal(noFirstSku.kpis.cur.newSkus, 0)   // missing firstSkuRows ⇒ defaults to 0, never throws
})
ok('Internal rows are dropped from every number (units, GRNs, vendors all exclude G5/9999)', () => {
  assert.equal(p.kpis.cur.units, 100 + 50 + 400 + 30 + 20)   // not +9999
  assert.equal(p.kpis.cur.grns, 4)                           // G5 not counted
  assert.ok(!p.vendors.some(v => v.vendor === 'Frido Warehouse Transfer'))
  assert.ok(!p.sourceMix.some(s => s.sourceType === 'Internal'))
  assert.ok(!p.filterOptions.sourceTypes.includes('Internal'))
})
ok('sales exclude pseudo / non-master SKUs; ratio = inward ÷ sales (3rd-party + Inhouse only, Internal excluded)', () => { assert.equal(p.kpis.cur.salesUnits, 225); assert.ok(Math.abs(p.kpis.cur.ratio - 600 / 225) < 1e-9) })
ok('daily trend covers every day and sums to the KPI', () => { assert.equal(p.daily.length, 31); assert.equal(p.daily.reduce((a, d) => a + d.total, 0), 600); assert.equal(p.daily.reduce((a, d) => a + d.sales, 0), 225) })
ok('source mix shares sum to 1', () => assert.ok(Math.abs(p.sourceMix.reduce((a, s) => a + s.share, 0) - 1) < 1e-9))
ok('vendor: units, GRNs, rejection % and last GRN date', () => {
  const acme = p.vendors.find(v => v.vendor === 'Acme')
  assert.equal(acme.units, 170); assert.equal(acme.grns, 2)
  assert.ok(Math.abs(acme.rejectionPct - (5 / 175) * 100) < 1e-9)
  assert.equal(acme.lastGrn, '2026-10-21')
  assert.ok(!('leadTimeDays' in acme)); assert.ok(!('avgDaysBetween' in acme))   // removed fields
})
ok('SKU table: units, GRNs, last inward', () => { const a = p.skus.find(s => s.sku === 'FR-A1'); assert.equal(a.units, 520); assert.equal(a.grns, 3); assert.equal(a.lastInward, '2026-10-21') })
ok('Product master: every master SKU is listed, including one never inwarded (FR-D1)', () => {
  assert.equal(p.masterSkus.length, masterRows.length)
  assert.ok(p.masterSkus.some(m => m.sku === 'FR-D1'))
})
ok('Product master: last inward date/qty/vendors come from lastSkuRows (full history), not range-bound', () => {
  const a = p.masterSkus.find(m => m.sku === 'FR-A1')
  assert.equal(a.lastInward, '2026-10-21')
  assert.equal(a.lastInwardQty, 35)             // 20 (Acme) + 15 (Far East) on the same last date
  assert.deepEqual(a.lastInwardVendors, ['Acme', 'Far East'])   // higher-qty vendor first
})
ok('Product master: a SKU never inwarded still has a row, with null last inward and 0 range qty', () => {
  const d = p.masterSkus.find(m => m.sku === 'FR-D1')
  assert.equal(d.lastInward, null); assert.equal(d.lastInwardQty, null)
  assert.deepEqual(d.lastInwardVendors, []); assert.equal(d.rangeQty, 0)
})
ok('Product master: Inward qty (range) matches the current-period GRN total for that SKU, ignoring page filters', () => {
  const a = build({ sourceType: ['Import'] }).masterSkus.find(m => m.sku === 'FR-A1')
  assert.equal(a.rangeQty, 520)   // same as the unfiltered SKU table total — masterSkus ignores F
})
ok('filters: source type narrows inward, not sales', () => { const f = build({ sourceType: ['Import'] }); assert.equal(f.kpis.cur.units, 400); assert.equal(f.kpis.cur.salesUnits, 225); assert.ok(f.meta.notes.some(n => /not filtered by vendor/.test(n))) })
ok('filters: warehouse narrows inward and sales', () => { const f = build({ warehouse: ['GGN'] }); assert.equal(f.kpis.cur.units, 430); assert.equal(f.kpis.cur.salesUnits, 25) })
ok('filters: SKU search', () => { const f = build({ sku: 'b1' }); assert.equal(f.kpis.cur.units, 50) })
ok('filter options come from the unfiltered current period', () => { const f = build({ warehouse: ['GGN'] }); assert.deepEqual(f.filterOptions.warehouses, ['PNQ', 'GGN']) })
ok('data quality only for admins', () => { assert.equal(build({}, false).dataQuality, null); assert.ok(build({}, true).dataQuality) })
ok('SKU drill-down SQL adds the SKU filter', () => { assert.ok(!GRN_SQL.includes('@sku')); assert.ok(SKU_GRN_SQL.includes('WHERE sku = @sku')) })
ok('vendor drill-down SQL adds the vendor filter', () => { assert.ok(!GRN_SQL.includes('@vendor')); assert.ok(VENDOR_GRN_SQL.includes('WHERE vendor = @vendor')) })
ok('sub-category drill-down SQL adds the sub_category filter', () => { assert.ok(!GRN_SQL.includes('@subCategory')); assert.ok(SUBCAT_GRN_SQL.includes('WHERE sub_category = @subCategory')) })
ok('DQ unmapped-SKU export SQL filters unresolved SKUs', () => {
  assert.ok(DQ_UNMAPPED_SKU_DETAIL_SQL.includes('WHERE product_code IS NULL'))
})
ok('DQ unmapped-vendor export SQL filters unresolved vendors on a RESOLVED sku, references j not the out-of-scope m alias', () => {
  assert.ok(DQ_UNMAPPED_VENDOR_DETAIL_SQL.includes('WHERE j.product_code IS NOT NULL AND v.vendor_name IS NULL'))
  assert.ok(DQ_UNMAPPED_VENDOR_DETAIL_SQL.includes('j.product_code AS resolvedSku'))
  // Regression check: the outer SELECT (after the j CTE closes) must never reference bare `m.` —
  // that alias only exists inside the j CTE's own subquery and is out of scope outside it.
  const outerSelect = DQ_UNMAPPED_VENDOR_DETAIL_SQL.split(/\)\s*\nSELECT/)[1]
  assert.ok(outerSelect && !/\bm\.product_code\b/.test(outerSelect))
})
ok('last-10-GRN-days: rolls up by day (units summed, GRNs as a distinct count), newest first, capped at N, zero-GRN days skipped', () => {
  const grnRows = [
    { d: '2026-10-21', g: 'G4', q: 20 },
    { d: '2026-10-20', g: 'G3a', q: 10 }, { d: '2026-10-20', g: 'G3a', q: 5 }, { d: '2026-10-20', g: 'G3b', q: 7 }, // 2 GRNs, 1 repeated line
    { d: '2026-10-10', g: 'G2', q: 400 },
    { d: '2026-09-15', g: 'G0', q: 300 },
  ]
  const r = buildLastGrnDays({ grnRows, days: 3 })
  assert.equal(r.rows.length, 3)                              // capped at 3, even though 4 distinct days exist
  assert.deepEqual(r.rows.map(x => x.date), ['2026-10-21', '2026-10-20', '2026-10-10'])  // newest first
  assert.equal(r.rows[1].units, 22); assert.equal(r.rows[1].grnCount, 2)  // 10+5+7, G3a+G3b
  assert.equal(r.lastGrnDate, '2026-10-21')
  assert.deepEqual(buildLastGrnDays({ grnRows: [] }).rows, [])             // no data ⇒ empty, not a throw
})
ok('GRN_SQL excludes Internal vendor_type at the source', () => assert.ok(GRN_SQL.includes("!= 'Internal'")))
ok('skuMonthly/prevSkuMonthly: units per (resolved SKU, month), current vs previous period, Internal excluded', () => {
  // Current period (Oct): FR-A1 100+400+20=520 units (G5's 9999 Internal row excluded), FR-B1 50, FR-C1 30.
  const byKey = m => Object.fromEntries((m || []).map(x => [`${x.sku}|${x.month}`, x.units]))
  const cur = byKey(p.skuMonthly)
  assert.equal(cur['FR-A1|2026-10-01'], 520)
  assert.equal(cur['FR-B1|2026-10-01'], 50)
  assert.equal(cur['FR-C1|2026-10-01'], 30)
  assert.equal(cur['FR-A1|2026-09-01'], undefined)   // Sep row is PREVIOUS period, not in skuMonthly
  const prev = byKey(p.prevSkuMonthly)
  assert.equal(prev['FR-A1|2026-09-01'], 300)         // the Sep-15 row, correctly in prevSkuMonthly
  assert.equal(Object.keys(prev).length, 1)
})
ok('SKUs supplied (vendor drill-down addition): units for ONE vendor, restricted to [start, end] — not full history', () => {
  // VENDOR_GRN_SQL rows carry the same per-line shape as GRN_SQL (s/sc/q); here Acme's own full-
  // history rows (as api/inward.js would fetch for the vendor drill-down): one line inside Oct (the
  // page's selected range), one line in Sep (full-history, but OUTSIDE the range) — only the Oct
  // line must count.
  const acmeRows = [
    { d: '2026-10-02', g: 'G1', s: 'FR-A1', sc: 'Gel Insole', q: 100 },
    { d: '2026-10-21', g: 'G4', s: 'FR-A1', sc: 'Gel Insole', q: 20 },
    { d: '2026-09-15', g: 'G0', s: 'FR-A1', sc: 'Gel Insole', q: 300 },  // outside [start, end] → excluded
  ]
  const r = buildVendorSkusSupplied({ grnRows: acmeRows, start: range.start, end: range.end })
  assert.equal(r.length, 1)
  assert.equal(r[0].sku, 'FR-A1'); assert.equal(r[0].subCategory, 'Gel Insole'); assert.equal(r[0].units, 120)  // 100+20, not +300
  assert.deepEqual(buildVendorSkusSupplied({ grnRows: [], start: range.start, end: range.end }), [])
})

console.log('2. SKU key (SQL expression twin of parseFinalSku + normSku)')
const sqlKey = s => String(s || '').replace(/_.*$/, '').replace(/-raw.*$/i, '').replace(/\s/g, '').toUpperCase()
for (const s of ['FR-CBS-BL1_COVER_RAW_PO165', 'FR-OPC-L1', 'fr-opc-l1-RAW-PO24', 'FR-AB 1', 'FR-X-raw_PO_25', 'FR-Y_RAW', 'ABC-RAWDATA'])
  ok(`"${s}"`, () => assert.equal(sqlKey(s), normSku(parseFinalSku(s))))

console.log('3. estimated stock + trend helpers')
ok('stock(day) = today − inward after + sales after', () => {
  const daily = [{ date: 'd1', inward: 0, sales: 10 }, { date: 'd2', inward: 100, sales: 5 }, { date: 'd3', inward: 0, sales: 20 }]
  assert.deepEqual(estimateStock(daily, 500).map(r => r.estStock), [500 - 100 + 25, 500 + 20, 500])
})
ok('auto grain: weekly > 90 d, monthly > 180 d', () => { assert.equal(autoGrain(31), 'daily'); assert.equal(autoGrain(91), 'weekly'); assert.equal(autoGrain(181), 'monthly') })
ok('weekly roll-up keeps totals', () => { const w = rollup(p.daily, 'weekly'); assert.equal(w.reduce((a, r) => a + r.total, 0), 600) })
ok('default range = 1st of month → today', () => assert.deepEqual(thisMonthRange(new Date(2026, 10, 8)), { start: '2026-11-01', end: '2026-11-08' }))
ok('stock join by skuKey + warehouse paths', () => {
  const inv = { locations: [{ location: 'PNQ', totalInvt: 900, avgSale: 30, doi: 28 }], skus: [{ sku: 'FR-A1', skuKey: 'FR-A1', category: 'Insoles', subCategory: 'Gel Insole', totalInvt: 600, avgSale: 20, doi: 30, locations: [{ location: 'PNQ', totalInvt: 600, avgSale: 20 }] }] }
  assert.equal(attachStock(p.skus, stockIndex(inv)).find(s => s.sku === 'FR-A1').doi, 30)
  assert.equal(warehouseStock(inv, {}).get('PNQ').doi, 28)                       // Health's own row
  assert.equal(warehouseStock(inv, { category: ['Insoles'] }).get('PNQ').doi, 30) // floor(600 / 20)
})
ok('TSV / CSV', () => { const cols = [{ label: 'A', key: 'a' }, { label: 'B', key: 'b' }]; assert.equal(toTsv(cols, [{ a: 'x', b: 1 }]), 'A\tB\nx\t1'); assert.equal(toCsv(cols, [{ a: 'x,y', b: 1 }]), 'A,B\n"x,y",1') })

console.log('4. server permission check (fake Supabase client)')
const fakeClient = ({ user, profile, grants }) => ({
  auth: { getUser: async () => (user ? { data: { user } } : { data: null, error: { message: 'bad jwt' } }) },
  from: table => {
    const q = { _t: table, select() { return q }, eq() { return q }, limit: async () => ({ data: grants, error: null }), maybeSingle: async () => ({ data: profile, error: null }) }
    return q
  },
})
const req = tok => ({ headers: tok ? { authorization: `Bearer ${tok}` } : {} })
const t = async (name, tok, client, expect) => { const r = await authorizeInward(req(tok), client); assert.equal(r.ok ? 200 : r.status, expect); passed++; console.log(`  ✓ ${name} → ${expect}`) }
await t('no token', null, fakeClient({}), 401)
await t('expired / invalid session', 'tok-bad', fakeClient({ user: null }), 401)
await t('deactivated member', 'tok-inactive', fakeClient({ user: { id: 'u1' }, profile: { is_admin: false, is_active: false } }), 403)
await t('member WITHOUT inventory:inward', 'tok-noperm', fakeClient({ user: { id: 'u2' }, profile: { is_admin: false, is_active: true }, grants: [] }), 403)
await t('member WITH inventory:inward', 'tok-perm', fakeClient({ user: { id: 'u3' }, profile: { is_admin: false, is_active: true }, grants: [{ tab: 'inventory:inward' }] }), 200)
await t('admin (no grant row needed)', 'tok-admin', fakeClient({ user: { id: 'u4' }, profile: { is_admin: true, is_active: true }, grants: [] }), 200)

console.log(`\nAll ${passed} checks passed.`)
