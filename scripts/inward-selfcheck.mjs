// Offline checks for Inventory → Inward (no credentials, no network):
//   node scripts/inward-selfcheck.mjs
// 1. aggregation: totals reconcile to the input rows, filters, previous period, COGS arithmetic
// 2. SKU key: the SQL sales-key expression mirrors parseFinalSku + normSku
// 3. estimated stock rebuild
// 4. server-side permission check (authorizeInward) against a fake Supabase client
import assert from 'node:assert/strict'
import { buildInwardPayload, periods, buildCogsLookup, SKU_GRN_SQL, GRN_SQL, normaliseFilters } from '../api/_inward_core.js'
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
  { d: '2026-10-02', g: 'G1', f: 'Vadgaon_OPS', v: 'Acme', t: 'Domestic', s: 'FR-A1', c: 'Insoles', sc: 'Gel Insole', n: 'Gel', q: 100, r: 5, lt: 10 },
  { d: '2026-10-02', g: 'G1', f: 'Vadgaon_OPS', v: 'Acme', t: 'Domestic', s: 'FR-B1', c: 'Cushions', sc: 'Seat Cushion', n: 'Seat', q: 50, r: 0, lt: 10 },
  { d: '2026-10-10', g: 'G2', f: 'Hexalog_GGN2', v: 'Far East', t: 'Import', s: 'FR-A1', c: 'Insoles', sc: 'Gel Insole', n: 'Gel', q: 400, r: 0, lt: 40 },
  { d: '2026-10-20', g: 'G3', f: 'Hexalog_GGN2', v: 'Frido Plant', t: 'Inhouse', s: 'FR-C1', c: 'Cushions', sc: 'Seat Cushion', n: 'Seat2', q: 30, r: 0, lt: null },
  { d: '2026-10-21', g: 'G4', f: 'Vadgaon_OPS', v: 'Acme', t: 'Domestic', s: 'FR-A1', c: 'Insoles', sc: 'Gel Insole', n: 'Gel', q: 20, r: 0, lt: 4 },
  // previous period (Sep)
  { d: '2026-09-15', g: 'G0', f: 'Vadgaon_OPS', v: 'Acme', t: 'Domestic', s: 'FR-A1', c: 'Insoles', sc: 'Gel Insole', n: 'Gel', q: 300, r: 0, lt: 8 },
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
]
const cogsRows = [
  { sku: 'FR-A1', month: '2026-10-01', cogs: 120, subCategory: 'Gel Insole' },
  { sku: 'FR-A1', month: '2026-09-01', cogs: 110, subCategory: 'Gel Insole' },
  { sku: 'FR-B1', month: '2026-10-01', cogs: 300, subCategory: 'Seat Cushion' },
  // FR-C1 has no COGS row → sub-category (SKU master) average for Oct = 300
]
const build = (filters = {}, isAdmin = false) => buildInwardPayload({ grnRows, salesRows, masterRows, skuMapRows: [], cogsRows, dqRows: [], refRows, range, filters: normaliseFilters(filters), isAdmin })

console.log('1. aggregation')
const p = build()
ok('period windows: Oct vs Sep (same 31 days ending the day before)', () => { assert.equal(range.prevStart, '2026-08-31'); assert.equal(range.prevEnd, '2026-09-30'); assert.equal(range.days, 31) })
ok('inward units = sum of current-period GRN quantities', () => assert.equal(p.kpis.cur.units, 100 + 50 + 400 + 30 + 20))
ok('previous-period units', () => assert.equal(p.kpis.prev.units, 300))
ok('GRNs / SKUs / vendors are distinct counts', () => { assert.equal(p.kpis.cur.grns, 4); assert.equal(p.kpis.cur.skus, 3); assert.equal(p.kpis.cur.vendors, 3) })
ok('₹ value = Σ units × month COGS (sub-category fallback for FR-C1)', () => assert.equal(p.kpis.cur.value, 520 * 120 + 50 * 300 + 30 * 300))
ok('sales exclude pseudo / non-master SKUs; ratio = inward ÷ sales', () => { assert.equal(p.kpis.cur.salesUnits, 225); assert.ok(Math.abs(p.kpis.cur.ratio - 600 / 225) < 1e-9) })
ok('daily trend covers every day and sums to the KPI', () => { assert.equal(p.daily.length, 31); assert.equal(p.daily.reduce((a, d) => a + d.total, 0), 600); assert.equal(p.daily.reduce((a, d) => a + d.sales, 0), 225) })
ok('source mix shares sum to 1', () => assert.ok(Math.abs(p.sourceMix.reduce((a, s) => a + s.share, 0) - 1) < 1e-9))
ok('vendor: rejection %, lead time per GRN, avg days between GRN days', () => {
  const acme = p.vendors.find(v => v.vendor === 'Acme')
  assert.equal(acme.units, 170); assert.equal(acme.grns, 2)
  assert.ok(Math.abs(acme.rejectionPct - (5 / 175) * 100) < 1e-9)
  assert.equal(acme.leadTimeDays, 7)          // GRNs G1 (10 d) and G4 (4 d) → 7
  assert.equal(acme.avgDaysBetween, 19)       // 2 Oct → 21 Oct over 1 gap
})
ok('warehouses map facility → location and carry same-period sales', () => {
  const pnq = p.warehouses.find(w => w.location === 'PNQ'), ggn = p.warehouses.find(w => w.location === 'GGN')
  assert.equal(pnq.units, 170); assert.equal(pnq.salesUnits, 200); assert.equal(ggn.units, 430); assert.equal(ggn.salesUnits, 25)
})
ok('category → sub-category roll-up', () => { const ins = p.categories.find(c => c.category === 'Insoles'); assert.equal(ins.units, 520); assert.equal(ins.subs[0].units, 520) })
ok('SKU table: units, GRNs, last inward', () => { const a = p.skus.find(s => s.sku === 'FR-A1'); assert.equal(a.units, 520); assert.equal(a.grns, 3); assert.equal(a.lastInward, '2026-10-21') })
ok('filters: source type narrows inward, not sales', () => { const f = build({ sourceType: ['Import'] }); assert.equal(f.kpis.cur.units, 400); assert.equal(f.kpis.cur.salesUnits, 225); assert.ok(f.meta.notes.some(n => /not filtered by vendor/.test(n))) })
ok('filters: warehouse narrows inward and sales', () => { const f = build({ warehouse: ['GGN'] }); assert.equal(f.kpis.cur.units, 430); assert.equal(f.kpis.cur.salesUnits, 25) })
ok('filters: SKU search', () => { const f = build({ sku: 'b1' }); assert.equal(f.kpis.cur.units, 50) })
ok('filter options come from the unfiltered current period', () => { const f = build({ warehouse: ['GGN'] }); assert.deepEqual(f.filterOptions.warehouses, ['PNQ', 'GGN']) })
ok('data quality only for admins', () => { assert.equal(build({}, false).dataQuality, null); assert.ok(build({}, true).dataQuality) })
ok('SKU drill-down SQL adds the SKU filter', () => { assert.ok(!GRN_SQL.includes('@sku')); assert.ok(SKU_GRN_SQL.includes('WHERE sku = @sku')) })
ok('COGS tiers', () => { const f = buildCogsLookup(cogsRows); assert.equal(f('FR-A1', '2026-10-09').rate, 120); assert.equal(f('FR-C1', '2026-10-09', 'Seat Cushion').tier, 'subcategory'); assert.equal(f('FR-X', '2026-10-09', 'Nope').rate, null) })

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
