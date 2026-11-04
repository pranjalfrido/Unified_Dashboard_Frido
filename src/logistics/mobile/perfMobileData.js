// Logistics → Performance on phones: the desktop LogisticsPage calculations, unchanged, as plain
// functions for the mobile cards. Every formula below is copied from the desktop JSX it names, so the
// numbers match the desktop tables cell for cell (scripts/responsive/check-log-perf-numbers.mjs).

const fx2 = v => +v.toFixed(2)

// ── KPI deltas: LKpiCard (App.jsx): (cur − prev) / prev, hidden when prev is 0 or |Δ| ≥ 999% ──
export function kpiDelta(cur, prev) {
  if (cur == null || prev == null || prev === 0) return null
  const chg = ((cur - prev) / prev) * 100
  return Math.abs(chg) < 999 ? chg : null
}
// RTO % change: the existing mobile SparkKpiCard formula (relative change of the RTO share).
export function rtoPctDelta(k, pk) {
  if (!(k.rto && pk.rto)) return null
  const chg = ((k.rto / k.total_shipments - pk.rto / pk.total_shipments) / (pk.rto / pk.total_shipments)) * 100
  return Math.abs(chg) < 999 ? chg : null
}

// ── Courier-wise breakdown (App.jsx "Courier-wise Breakdown") ──
export const SCORE_VIEWS = [
  { id: 'courier', label: 'Courier' }, { id: 'zone', label: 'Zone' }, { id: 'facility', label: 'Facility' }, { id: 'month', label: 'Month' },
]
// The 13 columns (+ Z-RTO % and Avg S2A on Facility / Month), in the desktop order.
const BASE_COLS = [
  { key: '_volPct', label: 'Vol %', pct: true }, { key: 'total', label: 'Total', int: true },
  { key: '_delPct', label: 'Del %', pct: true }, { key: '_rtoPct', label: 'RTO %', pct: true },
  { key: '_cancPct', label: 'Canc %', pct: true }, { key: '_fasrPct', label: 'FASR %', pct: true },
  { key: '_rasrPct', label: 'RASR %', pct: true }, { key: '_eddBreachPct', label: 'EDD breach %', pct: true },
  { key: 'avg_processing_days', label: 'Avg processing', days: true }, { key: 'avg_pickup_days', label: 'Avg pickup', days: true },
  { key: 'avg_intransit_days', label: 'Avg S2D', days: true }, { key: 'avg_fulfilment_days', label: 'Avg O2D', days: true },
  { key: 'avg_rto_tat_days', label: 'Avg RTO TAT', days: true },
]
export function scoreCols(view) {
  if (view !== 'facility' && view !== 'month') return BASE_COLS
  const c = [...BASE_COLS]
  c.splice(4, 0, { key: '_zrtoPct', label: 'Z-RTO %', pct: true })
  return [...c, { key: 'avg_s2a_days', label: 'Avg S2A', days: true }]
}
export const fmtCol = (col, v) => (v == null ? '—' : col.pct ? `${(+v).toFixed(2)}%` : col.days ? `${(+v).toFixed(2)}d` : (v || 0).toLocaleString('en-IN'))

// enriched rows, same toFixed(2) rounding as desktop
function enrich(rows, totalAll) {
  return rows.map(r => ({
    ...r,
    _volPct: fx2((r.total / totalAll) * 100),
    _delPct: r.total ? fx2((r.delivered / r.total) * 100) : 0,
    _rtoPct: r.total ? fx2((r.rto / r.total) * 100) : 0,
    _zrtoPct: r.total ? fx2(((r.z_rto || 0) / r.total) * 100) : 0,
    _cancPct: r.total ? fx2(((r.cancelled || 0) / r.total) * 100) : 0,
    _fasrPct: r.ofd_total ? fx2((r.d1 / r.ofd_total) * 100) : null,
    _rasrPct: r.ofd_total ? fx2(((r.rasr_num || 0) / r.ofd_total) * 100) : null,
    _eddBreachPct: (r.on_time || r.sla_breach) ? fx2(((r.sla_breach || 0) / ((r.on_time || 0) + (r.sla_breach || 0))) * 100) : null,
  }))
}
// Total row (each view's tfoot): sums, weighted TAT averages over the view's total.
function totalsOf(rows, tot) {
  const sum = k => rows.reduce((s, r) => s + (r[k] || 0), 0)
  const sOfd = sum('ofd_total'), sOn = sum('on_time'), sSla = sum('sla_breach')
  const wavg = key => rows.reduce((s, r) => s + (r[key] != null ? r[key] * (r.total || 0) : 0), 0) / tot
  return {
    total: tot, _volPct: 100,
    _delPct: (sum('delivered') / tot) * 100, _rtoPct: (sum('rto') / tot) * 100, _zrtoPct: (sum('z_rto') / tot) * 100, _cancPct: (sum('cancelled') / tot) * 100,
    _fasrPct: sOfd ? (sum('d1') / sOfd) * 100 : null, _rasrPct: sOfd ? (sum('rasr_num') / sOfd) * 100 : null,
    _eddBreachPct: (sOn + sSla) ? (sSla / (sOn + sSla)) * 100 : null,
    avg_processing_days: wavg('avg_processing_days'), avg_pickup_days: wavg('avg_pickup_days'), avg_intransit_days: wavg('avg_intransit_days'),
    avg_fulfilment_days: wavg('avg_fulfilment_days'), avg_rto_tat_days: wavg('avg_rto_tat_days'), avg_s2a_days: wavg('avg_s2a_days'),
  }
}

// Level-1 rows for a view, with names, keys, the desktop Total row and the RTO colour rule.
//   courier: breakdownSrc.byCourier · zone: byZoneFrido · facility: byFacility · month: data.byMonthAll
export function scoreRows(view, data, breakdownSrc) {
  let raw, nameOf
  if (view === 'zone') { raw = (breakdownSrc?.byZoneFrido || []).filter(r => r.zone_group); nameOf = r => `Zone ${r.zone_group}` }
  else if (view === 'facility') { raw = (breakdownSrc?.byFacility || []).filter(r => r.facility); nameOf = r => r.facility }
  else if (view === 'month') { raw = data?.byMonthAll || []; nameOf = r => r.month_label }
  else { raw = breakdownSrc?.byCourier || []; nameOf = r => r.courier_group }
  const totalAll = raw.reduce((s, r) => s + (r.total || 0), 0) || 1
  const rows = enrich(raw, totalAll).map(r => ({ ...r, _name: nameOf(r), _key: view === 'zone' ? r.zone_group : view === 'facility' ? r.facility : view === 'month' ? r.month_label : r.courier_group }))
  const total = totalsOf(rows, totalAll)
  // Courier view: RTO % red when above the overall RTO % of the rows shown (desktop rtoColor).
  const avgRtoPct = view === 'courier' ? (rows.reduce((s, r) => s + (r.rto || 0), 0) / (rows.reduce((s, r) => s + r.total, 0) || 1)) * 100 : null
  return { rows, total, avgRtoPct }
}

// Level-2 rows (the desktop ▸ drill): source, order and label per (view, drill); % of the parent.
export function drillRows(view, drill, parent, src) {
  const by = (arr, k, v) => (src?.[arr] || []).filter(x => x[k] === v)
  const byTotal = (a, b) => b.total - a.total, byZone = (a, b) => (a.zone_group < b.zone_group ? -1 : 1)
  let rows = [], label = () => ''
  if (view === 'courier') {
    if (drill === 'zone') { rows = by('byCourierZone', 'courier_group', parent.courier_group).sort(byZone); label = z => `Zone ${z.zone_group}` }
    else if (drill === 'facility') { rows = by('byCourierFacility', 'courier_group', parent.courier_group).sort(byTotal); label = z => z.facility }
    else if (drill === 'month') { rows = by('byCourierMonth', 'courier_group', parent.courier_group).sort((a, b) => (a.month_dt < b.month_dt ? -1 : 1)); label = z => z.month_label }
  } else if (view === 'zone') {
    if (drill === 'courier') { rows = by('byCourierZone', 'zone_group', parent.zone_group).sort(byTotal); label = z => z.courier_group }
    else if (drill === 'facility') { rows = by('byZoneFacility', 'zone_group', parent.zone_group).sort(byTotal); label = z => z.facility }
  } else if (view === 'facility') {
    if (drill === 'courier') { rows = by('byCourierFacility', 'facility', parent.facility).sort(byTotal); label = z => z.courier_group }
    else if (drill === 'zone') { rows = by('byZoneFacility', 'facility', parent.facility).sort(byZone); label = z => `Zone ${z.zone_group}` }
  }
  return rows.map(z => ({
    ...z,
    _name: label(z),
    _volPct: parent.total ? fx2((z.total / parent.total) * 100) : 0,
    _delPct: z.total ? fx2((z.delivered / z.total) * 100) : 0,
    _rtoPct: z.total ? fx2((z.rto / z.total) * 100) : 0,
    _zrtoPct: z.total ? fx2(((z.z_rto || 0) / z.total) * 100) : 0,
    _cancPct: z.total ? fx2(((z.cancelled || 0) / z.total) * 100) : 0,
    _fasrPct: z.ofd_total ? fx2((z.d1 / z.ofd_total) * 100) : null,
    _rasrPct: z.ofd_total ? fx2(((z.rasr_num || 0) / z.ofd_total) * 100) : null,
    // EDD breach is only worked out on the Zone view's drill rows; the others show "—" (as desktop).
    _eddBreachPct: view === 'zone' && (z.on_time || z.sla_breach) ? fx2(((z.sla_breach || 0) / ((z.on_time || 0) + (z.sla_breach || 0))) * 100) : null,
  }))
}

// Month view colours (desktop delColor / rtoColor / tatColor): good / watch / bad.
export function monthTone(col, v) {
  if (v == null) return null
  if (col === '_delPct') return v >= 80 ? 'good' : v >= 60 ? 'watch' : 'bad'
  if (col === '_rtoPct') return v <= 3 ? 'good' : v <= 7 ? 'watch' : 'bad'
  const T = { avg_processing_days: [2, 1], avg_pickup_days: [1, 0.5], avg_intransit_days: [4, 2], avg_fulfilment_days: [6, 4], avg_rto_tat_days: [10, 5], avg_s2a_days: [3, 1.5] }[col]
  if (!T) return null
  return +v <= T[1] ? 'good' : +v <= T[0] ? 'watch' : 'bad'
}

// ── TAT buckets (App.jsx "TAT Bucket Analysis") ──
// TAT_CFG and getSeverity copied as-is; only red is shown, and never on a table's last row.
const TAT_CFG = {
  processing: [{ dir: 'higher', green: 75, watch: 60 }, { dir: 'lower', green: 15, watch: 25 }, { dir: 'lower', green: 3, watch: 6 }, { dir: 'lower', green: 2, watch: 5 }],
  pickup: [{ dir: 'higher', green: 65, watch: 45 }, { dir: 'lower', green: 12, watch: 18 }, { dir: 'lower', green: 20, watch: 35 }, { dir: 'lower', green: 3, watch: 6 }],
  transit: [{ dir: 'higher', green: 50, watch: 25 }, { dir: 'lower', green: 35, watch: 45 }, { dir: 'lower', green: 15, watch: 25 }, { dir: 'lower', green: 10, watch: 20 }],
  fulfilment: [{ dir: 'higher', green: 6, watch: 3 }, { dir: 'lower', green: 20, watch: 30 }, { dir: 'lower', green: 25, watch: 35 }, { dir: 'lower', green: 20, watch: 35 }],
}
const severity = (pct, cfg) => (cfg.dir === 'higher' ? (pct >= cfg.green ? 'green' : pct >= cfg.watch ? 'amber' : 'red') : (pct <= cfg.green ? 'green' : pct <= cfg.watch ? 'amber' : 'red'))
export const TAT_VIEWS = [
  { id: 'processing', label: 'Processing', def: 'Order creation → shipment creation · by facility', buckets: ['0–1d', '2–3d', '4–5d', '5+d'], keys: ['op_0_1', 'op_2_3', 'op_4_5', 'op_5plus'], src: 'facility' },
  { id: 'pickup', label: 'Pickup', def: 'Shipment creation → shipment pickup · by courier', buckets: ['0–12h', '12–24h', '24–48h', '48h+'], keys: ['proc_0_12h', 'proc_12_24h', 'proc_24_48h', 'proc_48plus'], src: 'courierGrouped' },
  { id: 'transit', label: 'In-transit', def: 'Shipment pickup → shipment delivery · by courier', buckets: ['0–1d', '2–3d', '4–5d', '5+d'], keys: ['bucket_0_1', 'bucket_2_3', 'bucket_4_5', 'bucket_5plus'], src: 'courier' },
  { id: 'fulfilment', label: 'Fulfilment', def: 'Order creation → shipment delivery · by facility', buckets: ['0–1d', '2–3d', '4–5d', '5+d'], keys: ['ord_0_1', 'ord_2_3', 'ord_4_5', 'ord_5plus'], src: 'facility' },
]
// → { total: { name, pcts, flags }, rows: [{ name, pcts, flags }] }; pcts are the desktop pctB values.
export function tatTable(view, data) {
  const v = TAT_VIEWS.find(x => x.id === view)
  const tatByFacility = (data?.tatByFacility || []).filter(r => r.facility && r.facility.trim())
  const tatByCourier = data?.tatByCourier || []
  const grouped = data?.tatByCourierGrouped || []
  const sumKeys = rows => rows.reduce((acc, r) => { for (const k of [...v.keys, 'delivered']) acc[k] = (acc[k] || 0) + (r[k] || 0); return acc }, {})
  const src = v.src === 'facility' ? tatByFacility : v.src === 'courier' ? tatByCourier : grouped
  const nameOf = r => (v.src === 'facility' ? r.facility : v.src === 'courier' ? r.courier_group : r.label)
  // In-transit percentages are of delivered shipments; the others of the four buckets' sum.
  const rowTot = r => (view === 'transit' ? r.delivered || 0 : v.keys.reduce((s, k) => s + (r[k] || 0), 0))
  const pct = (x, t) => (t ? +((x / t) * 100).toFixed(1) : null)
  const rows = src.map((r, i, arr) => {
    const t = rowTot(r)
    const pcts = v.keys.map(k => pct(r[k] || 0, t))
    const isLast = i === arr.length - 1
    return { name: nameOf(r), pcts, flags: v.keys.map((k, ci) => !isLast && severity(t ? ((r[k] || 0) / t) * 100 : 0, TAT_CFG[view][ci]) === 'red') }
  })
  // Total row: Pickup sums the facility rows (as desktop), In-transit the courier rows over delivered.
  const totSrc = sumKeys(view === 'transit' ? tatByCourier : tatByFacility)
  const tt = view === 'transit' ? totSrc.delivered || 0 : v.keys.reduce((s, k) => s + (totSrc[k] || 0), 0)
  return { total: { name: 'Total', pcts: v.keys.map(k => pct(totSrc[k] || 0, tt)), flags: v.keys.map(() => false) }, rows }
}

// ── Weight (App.jsx "Shipment Allocation by Weight" + "Delivery Performance by Weight Slab") ──
const SLABS = ['0-500g', '500g-1kg', '1-2kg', '2-5kg', '5-10kg', '10-20kg', '20-50kg', '50kg+']
export function weightRows(data, metric) {
  const wData = (data?.byWeightSlab || []).filter(r => r.slab !== 'Unknown')
  const ordered = SLABS.map(s => wData.find(x => x.slab === s)).filter(Boolean)
  const grandTotal = ordered.reduce((s, r) => s + (r.total || 0), 0) || 1
  const grandValue = ordered.reduce((s, r) => s + (r.total_value || 0), 0) || 1
  return ordered.map(r => ({
    slab: r.slab, value: metric === 'qty' ? r.total || 0 : r.total_value || 0,
    pct: metric === 'qty' ? +(((r.total || 0) / grandTotal) * 100).toFixed(1) : +(((r.total_value || 0) / grandValue) * 100).toFixed(1),
    rto_pct: r.rto_pct, avg_tat: r.avg_tat, total: r.total, total_value: r.total_value,
  })).sort((a, b) => b.value - a.value)
}
export const fmtSlabValue = v => (v >= 10000000 ? '₹' + (v / 10000000).toFixed(1) + 'Cr' : v >= 100000 ? '₹' + (v / 100000).toFixed(1) + 'L' : v >= 1000 ? '₹' + (v / 1000).toFixed(0) + 'K' : '₹' + v)

// ── Geography: top 10 merged by name (all shipment types), % of those rows ──
export const GEO_VIEWS = [{ id: 'dropCity', label: 'Drop city', src: 'topDropCities', key: 'city' }, { id: 'pickupCity', label: 'Pickup city', src: 'topPickupCities', key: 'city' }, { id: 'dropState', label: 'Drop state', src: 'topDropStates', key: 'state' }]
export function geoRows(data, view) {
  const g = GEO_VIEWS.find(x => x.id === view)
  const merged = Object.values((data?.[g.src] || []).reduce((m, r) => { const k = r[g.key]; m[k] = { name: k, total: (m[k]?.total || 0) + r.total }; return m }, {})).sort((a, b) => b.total - a.total).slice(0, 10)
  const grandTotal = merged.reduce((s, r) => s + (r.total || 0), 0) || 1
  return merged.map(r => ({ ...r, pct: ((r.total / grandTotal) * 100).toFixed(1) }))
}

// ── RTO analysis ──
export const RTO_BUCKETS = ['0-1', '2-4', '5-7', '8-10', '10+']
const bKey = (pfx, b) => (b === '0-1' ? `${pfx}_0_1` : b === '2-4' ? `${pfx}_2_4` : b === '5-7' ? `${pfx}_5_7` : b === '8-10' ? `${pfx}_8_10` : `${pfx}_10plus`)
const pct1 = (v, tot) => (tot ? +((v / tot) * 100).toFixed(1) : null)
// mode 'ageing' (base order | shipment | pickup) or 'delivery' (RTO mark → delivered back)
export function rtoAgeingRows(data, mode, base) {
  const ageing = (data?.rtoAgeing || []).filter(r => r.total_rto > 0)
  const pfx = mode === 'delivery' ? 'rtodel' : base
  const rowTotal = r => (mode === 'delivery' ? RTO_BUCKETS.reduce((s, b) => s + (r[bKey('rtodel', b)] || 0), 0) : r.total_rto)
  const shape = (name, counts, tot) => ({ name, total: tot, counts, pcts: counts.map(c => (c > 0 ? pct1(c, tot) : null)) })
  const rows = ageing.map(r => shape(r.courier_group, RTO_BUCKETS.map(b => r[bKey(pfx, b)] || 0), rowTotal(r)))
  const sums = RTO_BUCKETS.map(b => ageing.reduce((s, r) => s + (r[bKey(pfx, b)] || 0), 0))
  const totAll = mode === 'delivery' ? sums.reduce((a, b) => a + b, 0) : ageing.reduce((s, r) => s + (r.total_rto || 0), 0)
  return { rows, total: shape('Total', sums, totAll) }
}
export function rtoReasonRows(data) {
  const reasons = (data?.rtoReasons || []).filter(r => r.reason && r.total > 0).sort((a, b) => b.total - a.total)
  const totalRto = reasons.reduce((s, r) => s + r.total, 0) || 1
  return reasons.map(r => ({ name: r.reason, total: r.total, pct: ((r.total / totalRto) * 100).toFixed(1) }))
}

// ── NDR (App.jsx "NDR Analysis"): rows by courier for the payment toggle, plus the Total row ──
export function ndrTable(data, pay) {
  const all = data?.ndrByCourier || []
  const filtered = pay === 'All' ? all : all.filter(r => r.payment_mode === pay)
  const blank = () => ({ total_shipments: 0, attempted_shipments: 0, ndr_count: 0, ndr_del: 0, ndr_rto: 0, del_att2: 0, del_att3: 0, del_att3plus: 0, _att_sum: 0, _att_n: 0, _tat_sum: 0, _tat_n: 0, _o2d_sum: 0, _o2d_n: 0 })
  const add = (c, r) => {
    for (const k of ['total_shipments', 'attempted_shipments', 'ndr_count', 'ndr_del', 'ndr_rto', 'del_att2', 'del_att3', 'del_att3plus']) c[k] += r[k] || 0
    if (r.avg_att != null) { c._att_sum += r.avg_att * (r.ndr_count || 0); c._att_n += r.ndr_count || 0 }
    if (r.avg_intransit_days != null) { c._tat_sum += r.avg_intransit_days * (r.ndr_del || 0); c._tat_n += r.ndr_del || 0 }
    if (r.avg_o2d != null) { c._o2d_sum += r.avg_o2d * (r.ndr_del || 0); c._o2d_n += r.ndr_del || 0 }
  }
  const fin = c => ({ ...c, avg_att: c._att_n ? +(c._att_sum / c._att_n).toFixed(2) : null, avg_intransit_days: c._tat_n ? +(c._tat_sum / c._tat_n).toFixed(2) : null, avg_o2d: c._o2d_n ? +(c._o2d_sum / c._o2d_n).toFixed(2) : null })
  const map = {}
  for (const r of filtered) { if (!map[r.courier]) map[r.courier] = { courier: r.courier, ...blank() }; add(map[r.courier], r) }
  const rows = Object.values(map).sort((a, b) => b.ndr_count - a.ndr_count).map(fin)
  const tot = blank(); for (const r of rows) add(tot, r)
  return { rows, total: fin(tot) }
}
export const ndrPct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '—')
