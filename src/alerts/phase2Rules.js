// Alerts Phase 2 — turns the raw numbers in public/alerts-phase2.json (scripts/generate-alerts-phase2.mjs) into
// bell alerts. Every bar is read from ALERT_RULES / ADS_RULES / CUSTOMER_RULES / SUPPORT_RULES / PNL_RULE_BARS
// (src/config/metricTargets.js); nothing is hard-coded here, so retuning is a one-line change there.
//
// Channel-wise: each rule is evaluated per channel / warehouse / courier into small "atoms" that carry the
// permission needed to see them. Atoms the viewer cannot see are dropped BEFORE grouping, so every user gets one
// grouped alert ("Return % high on Amazon, Flipkart") that names only the channels they have access to.
//
// Two kinds: SPIKE alerts -> bell list (unread badge); TARGET alerts (fixed business targets that are missed on
// > 1 day in 3 — see docs/ALERTS_PHASE2_BACKTEST.md) -> the bell's separate "Targets missed" section, refreshed
// weekly by the script, never counted in the badge.
import { ALERT_RULES as R, ADS_RULES, CUSTOMER_RULES, SUPPORT_RULES, PNL_RULE_BARS, PNL_RULE_BAR_OVERRIDES, PNL_CHANNEL_GROUP } from '../config/metricTargets.js'

let _cache = null
let _promise = null
export function loadAlertsPhase2() {
  if (_promise) return _promise
  _promise = import('../authFetch.js').then(m => m.authFetch('/alerts-phase2.json', { cache: 'no-cache' })).then(r => r.ok ? r.json() : null).then(j => { _cache = j; return j }).catch(() => { _cache = null; return null })
  return _promise
}
export const getAlertsPhase2 = () => _cache

const NAME = { Shopify: 'D2C', shopify: 'D2C', offline_sales: 'Offline', offline: 'Offline', ebo: 'EBO', amazon: 'Amazon', flipkart: 'Flipkart', blinkit: 'Blinkit', zepto: 'Zepto', instamart: 'Instamart', myntra: 'Myntra', cred: 'CRED', firstcry: 'Firstcry', D2C: 'D2C' }
const nm = k => NAME[k] || NAME[String(k).toLowerCase()] || k
const slug = k => String(k).toLowerCase().replace('offline_sales', 'offline').replace(/^d2c$/, 'shopify')
const p1 = v => `${(+v).toFixed(1)}%`
const rs = v => { const a = Math.abs(v); return a >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : a >= 1e5 ? `₹${(v / 1e5).toFixed(1)} L` : `₹${Math.round(v).toLocaleString('en-IN')}` }
// target severity: red once the miss is targetRedMargin beyond the bar, else amber
const tgtSev = (value, bar, dir) => dir === 'max' ? (value > bar * (1 + R.targetRedMargin) ? 'red' : 'amber') : (value < bar * (1 - R.targetRedMargin) ? 'red' : 'amber')

const salesNav = k => ({ page: 'sales', sub: slug(k) })
const salesPerm = k => `sales:${slug(k)}`

// ── rule builders: each returns { rule, group, title(names), atoms:[{entity, perm, sev, text, nav}] } ───────────
function rules(cache) {
  const out = []
  const w = cache.windows || {}
  const T = cache.targets || {}
  const add = (rule, group, title, atoms, note) => { if (atoms?.length) out.push({ rule, group, title, atoms, note }) }

  // #1 Revenue declining vs the previous equal 7-day period
  if (cache.rev) {
    const atoms = []
    for (const [ch, bar] of Object.entries(R.revenueDropPct)) {
      const c = cache.rev.channels?.[ch]; if (!c || !(c.prev > 0)) continue
      const d = (c.cur - c.prev) / c.prev * 100
      if (d < -bar) atoms.push({ entity: ch === 'Overall' ? 'Overall' : nm(ch), perm: ch === 'Overall' ? 'overview' : salesPerm(ch), sev: d <= -2 * bar ? 'red' : 'amber', text: `${ch === 'Overall' ? 'Overall' : nm(ch)} ${p1(d)} (${rs(c.cur)} vs ${rs(c.prev)})`, nav: ch === 'Overall' ? { page: 'overview' } : salesNav(ch) })
    }
    add('revDrop', 'spike', n => `Revenue declining: ${n}`, atoms, `${w.rev?.label} vs ${w.rev?.prev?.label}`)
  }

  // #2 Return % high (spike) and #2 Flipkart / Myntra 20% (target)
  if (cache.returns) {
    const atoms = [], tatoms = []
    for (const [ch, bar] of Object.entries(R.returnPctMax)) {
      const c = cache.returns.channels?.[ch]; if (!c || !(c.gross > (R.returnMinGross[ch] || 0))) continue
      const v = c.ret / c.gross * 100
      if (v > bar) atoms.push({ entity: nm(ch), perm: salesPerm(ch), sev: v > bar + 10 ? 'red' : 'amber', text: `${nm(ch)} ${p1(v)} (bar ${bar}%)`, nav: salesNav(ch) })
    }
    add('returnPct', 'spike', n => `Return % high: ${n}`, atoms, `Orders ${w.returns?.label}`)
    const eb = cache.returns.channels?.EBO
    if (eb?.gross > 0) { const v = eb.ret / eb.gross * 100; if (v > R.eboReturnPctMax) add('eboReturn', 'spike', () => 'EBO return % high', [{ entity: 'EBO', perm: 'sales:ebo', sev: v > R.eboReturnPctMax + 5 ? 'red' : 'amber', text: `EBO ${p1(v)} (bar ${R.eboReturnPctMax}%)`, nav: salesNav('ebo') }], `Orders ${w.returns?.label}`) }
    const off = cache.returns.offline
    if (off?.rev > 0) { const v = off.creditNotes / off.rev * 100; if (v > R.offlineCreditNotePctMax) add('offlineCn', 'spike', () => 'Offline credit-note rate high', [{ entity: 'Offline', perm: 'sales:offline', sev: v > 2 * R.offlineCreditNotePctMax ? 'red' : 'amber', text: `Offline ${p1(v)} (bar ${R.offlineCreditNotePctMax}%)`, nav: salesNav('offline') }], `Orders ${w.returns?.label}`) }
    for (const [ch, bar] of Object.entries(R.returnPctTarget)) {
      const c = T.returns?.channels?.[ch]; if (!c || !(c.gross > 0)) continue
      const v = c.ret / c.gross * 100
      if (v > bar) tatoms.push({ entity: nm(ch), perm: salesPerm(ch), sev: tgtSev(v, bar, 'max'), text: `${nm(ch)} ${p1(v)} (target ${bar}%)`, nav: salesNav(ch) })
    }
    add('returnTarget', 'target', n => `Return % above the 20% target: ${n}`, tatoms, `Orders ${T.returns?.window?.label}`)
  }

  // #7 D2C sub-category return % jump (top N by returns ₹)
  if (cache.subcats?.rows) {
    const rows = cache.subcats.rows.filter(r => r.avg4 > 0 && r.pct > R.subCatReturnMultiple * r.avg4 && r.lost >= R.subCatMinReturnRs).sort((a, b) => b.lost - a.lost).slice(0, R.subCatTopN)
    add('subCatJump', 'spike', n => `D2C sub-category return % jumped: ${n}`, rows.map(r => ({ entity: r.subCategory, perm: 'sales:shopify', sev: 'amber', text: `${r.subCategory} ${p1(r.pct)} vs ${p1(r.avg4)} 4-week avg (${rs(r.lost)} returned)`, nav: { page: 'sales', sub: 'shopify' } })), `Orders ${w.subcats?.label}`)
  }

  // #8-#11 P&L (held back until pnlAlertsEnabled)
  if (R.pnlAlertsEnabled && cache.pnl?.tabs) {
    const barsFor = tab => ({ ...PNL_RULE_BARS[PNL_CHANNEL_GROUP[tab]], ...(PNL_RULE_BAR_OVERRIDES[tab] || {}), ...(R.pnlBarOverrides[tab] || {}) })
    const spec = [
      { rule: 'pnlCm1', key: 'cm1Pct', bar: 'cm1', id: 'cm1', dir: 'min', label: 'CM1 %', title: n => `CM1 % below the bar: ${n}`, red: 10 },
      { rule: 'pnlGm', key: 'gmPct', bar: 'gm', id: 'gm', dir: 'min', label: 'GM %', title: n => `GM % below the bar: ${n}`, red: 10 },
      { rule: 'pnlCogs', key: 'cogsPct', bar: 'cogs', id: 'cogs', dir: 'max', label: 'COGS %', title: n => `COGS % above the bar: ${n}`, red: 10 },
    ]
    const TABS = ['shopify', 'amazon', 'flipkart', 'ebo', 'offline', 'blinkit', 'zepto', 'instamart', 'cred', 'firstcry', 'myntra']
    for (const s of spec) {
      const atoms = [], tatoms = []
      for (const tab of TABS) {
        const targetOnly = (R.pnlTargetOnly[tab] || []).includes(s.id)
        const src = targetOnly ? T.pnl?.tabs?.[tab] : cache.pnl.tabs[tab]
        const v = src?.[s.key], bar = barsFor(tab)[s.bar]
        if (v == null || bar == null) continue
        const breach = s.dir === 'min' ? v < bar : v > bar
        if (!breach) continue
        const a = { entity: nm(tab), perm: `pnl:${tab}`, sev: (s.dir === 'min' ? bar - v : v - bar) > s.red ? 'red' : 'amber', text: `${nm(tab)} ${p1(v)} (bar ${s.dir === 'min' ? '≥' : '≤'} ${bar}%)`, nav: { page: 'pnl', sub: tab } }
        ;(targetOnly ? tatoms : atoms).push(a)
      }
      add(s.rule, 'spike', s.title, atoms, `Orders ${w.pnl?.label}`)
      add(`${s.rule}Target`, 'target', s.title, tatoms, `Orders ${T.pnl?.window?.label}`)
    }
    const snd = []
    for (const [tab, bar] of Object.entries(R.pnlSndMax)) { const v = cache.pnl.tabs[tab]?.sndPct; if (v != null && v > bar) snd.push({ entity: nm(tab), perm: `pnl:${tab}`, sev: 'amber', text: `${nm(tab)} ${p1(v)} (bar ≤ ${bar}%)`, nav: { page: 'pnl', sub: tab } }) }
    add('pnlSnd', 'spike', n => `SnD % high: ${n}`, snd, `Orders ${w.pnl?.label}`)
  }

  // #12 ROAS down (Ads-page ROAS, ADS_RULES bar and spend floor)
  if (cache.ads?.platforms) {
    const atoms = []
    for (const [tab, p] of Object.entries(cache.ads.platforms)) {
      if (p.roas == null || !p.prevRoas || p.spend < ADS_RULES.roasDropMinSpend || p.prevSpend < ADS_RULES.roasDropMinSpend) continue
      const d = (p.roas / p.prevRoas - 1) * 100
      if (d <= -ADS_RULES.roasDropPct) atoms.push({ entity: nm(tab), perm: `ads:${slug(tab)}`, sev: d <= -2 * ADS_RULES.roasDropPct ? 'red' : 'amber', text: `${nm(tab)} ROAS ${p.roas.toFixed(2)} vs ${p.prevRoas.toFixed(2)} (${p1(d)})`, nav: { page: 'ads', sub: slug(tab) } })
    }
    add('roasDown', 'spike', n => `ROAS down: ${n}`, atoms, `${cache.ads.window?.label} vs the 7 days before`)
  }
  // #13 Unattributed spend (admin only, a target)
  if (T.unattributed?.spend > 0) {
    const U = T.unattributed, atoms = []
    const share = U.unattributed / U.spend
    if (share > R.unattributedShareMax) atoms.push({ entity: 'All ads', perm: 'admin', sev: 'amber', text: `All ads ${p1(share * 100)} of spend unattributed (${rs(U.unattributed)})`, nav: { page: 'ads' } })
    for (const [p, v] of Object.entries(U.byPlatform || {})) if (v.spend > 0 && v.unattributed / v.spend > R.unattributedShareMax) atoms.push({ entity: p, perm: 'admin', sev: 'amber', text: `${p} ${p1(v.unattributed / v.spend * 100)}`, nav: { page: 'ads', sub: slug(p === 'Meta' || p === 'Google' ? 'D2C' : p) } })
    add('unattributed', 'target', () => 'Unattributed ad spend above 20%', atoms, `${U.window?.label}`)
  }

  // #3 / #15 warehouse fill rate and allocation: weekly targets + a spike vs the warehouse's own 4-week average
  if (T.alloc?.warehouses) {
    const f = [], a = []
    for (const [wh, v] of Object.entries(T.alloc.warehouses)) {
      if (v.fillRate != null && v.fillRate < R.fillRateMin) f.push({ entity: wh, perm: 'inventory:sales', sev: tgtSev(v.fillRate, R.fillRateMin, 'min'), text: `${wh} ${p1(v.fillRate)}`, nav: { page: 'inventory', sub: 'sales' } })
      if (v.allocationPct != null && v.allocationPct < R.allocationWarnMin) a.push({ entity: wh, perm: 'inventory:sales', sev: v.allocationPct < R.allocationCritMin ? 'red' : 'amber', text: `${wh} ${p1(v.allocationPct)}`, nav: { page: 'inventory', sub: 'sales' } })
    }
    for (const [ch, v] of Object.entries(T.alloc.channels || {})) for (const [loc, pct] of Object.entries(v.alloc || {})) if (pct < R.allocationCritMin) a.push({ entity: `${ch} · ${loc}`, titleName: null, perm: 'inventory:sales', sev: 'red', text: `${ch} from ${loc} ${p1(pct)}`, nav: { page: 'inventory', sub: 'sales' } })
    add('fillRateTarget', 'target', n => `Warehouse fill rate below ${R.fillRateMin}%: ${n}`, f, `Sales ${T.alloc.window?.label}`)
    add('allocationTarget', 'target', n => `Allocation shortfall (< ${R.allocationWarnMin}% warning, < ${R.allocationCritMin}% critical): ${n}`, a, `Sales ${T.alloc.window?.label}`)
  }
  if (cache.alloc?.warehouses) {
    const f = [], a = []
    for (const [wh, v] of Object.entries(cache.alloc.warehouses)) {
      if (v.fillRate != null && v.fillAvg4 != null && v.fillRate < v.fillAvg4 - R.fillRateDropPts) f.push({ entity: wh, perm: 'inventory:sales', sev: 'amber', text: `${wh} ${p1(v.fillRate)} vs ${p1(v.fillAvg4)} 4-week avg`, nav: { page: 'inventory', sub: 'sales' } })
      if (v.allocationPct != null && v.allocAvg4 != null && v.allocationPct < v.allocAvg4 - R.fillRateDropPts) a.push({ entity: wh, perm: 'inventory:sales', sev: 'amber', text: `${wh} ${p1(v.allocationPct)} vs ${p1(v.allocAvg4)} 4-week avg`, nav: { page: 'inventory', sub: 'sales' } })
    }
    add('fillRateDrop', 'spike', n => `Warehouse fill rate down: ${n}`, f, `Sales ${w.alloc?.label}`)
    add('allocationDrop', 'spike', n => `Warehouse allocation down: ${n}`, a, `Sales ${w.alloc?.label}`)
  }

  // #14 OOS loss bands (overall + top categories)
  if (cache.oos) {
    const atoms = []
    if (cache.oos.loss > R.oosOverallWarn) atoms.push({ entity: 'Overall', perm: 'inventory', sev: cache.oos.loss > R.oosOverallCrit ? 'red' : 'amber', text: `Overall ${rs(cache.oos.loss)} lost across ${cache.oos.skus} SKUs`, nav: { page: 'inventory', sub: 'health' } })
    const cats = Object.entries(cache.oos.byCategory || {}).filter(([, v]) => v > R.oosCategoryWarn).sort((x, y) => y[1] - x[1]).slice(0, 3)
    for (const [c, v] of cats) atoms.push({ entity: c, perm: 'inventory', sev: v > R.oosCategoryCrit ? 'red' : 'amber', text: `${c} ${rs(v)}`, nav: { page: 'inventory', sub: 'health' } })
    add('oosLoss', 'spike', n => `Out-of-stock loss high: ${n}`, atoms, `as of ${cache.oos.asOf}`)
  }

  // #16 courier spike — one grouped alert listing couriers
  if (cache.logistics?.couriers) {
    const atoms = []
    for (const c of cache.logistics.couriers) {
      if (c.total < R.courierSpikeMinShipments || c.n < 4 || c.rtoMean == null) continue
      const rSd = Math.max(c.rtoSd, 0.5), dSd = Math.max(c.delSd, 0.5), f = []
      if (c.rtoPct > c.rtoMean + R.courierSpikeSd * rSd && c.rtoPct - c.rtoMean >= R.courierSpikeMinPts) f.push(`RTO ${p1(c.rtoPct)} vs ${p1(c.rtoMean)} normal`)
      if (c.delPct < c.delMean - R.courierSpikeSd * dSd && c.delMean - c.delPct >= R.courierSpikeMinPts) f.push(`delivery ${p1(c.delPct)} vs ${p1(c.delMean)} normal`)
      if (f.length) atoms.push({ entity: c.courier, perm: 'logistics', sev: 'amber', text: `${c.courier}: ${f.join(', ')}`, nav: { page: 'logistics' } })
    }
    add('courierSpike', 'spike', n => `Courier performance spike: ${n}`, atoms, `Orders ${w.logistics?.label}`)
  }

  // #17-#21 logistics targets (forward, latest mature 7 days)
  if (T.logistics?.forward) {
    const L = T.logistics, lw = `Orders ${L.window?.label}`, nav = { page: 'logistics' }
    const one = (rule, title, v, bar, dir, label) => { if (v != null && (dir === 'max' ? v > bar : v < bar)) add(rule, 'target', () => title, [{ entity: label, perm: 'logistics', sev: tgtSev(v, bar, dir), text: `${label} ${p1(v)} (target ${dir === 'max' ? '≤' : '≥'} ${bar}%)`, nav }], lw) }
    const f = L.forward
    one('rtoTarget', `RTO % above ${R.rtoTargetMax}%`, f.total ? f.rto / f.total * 100 : null, R.rtoTargetMax, 'max', 'Forward RTO')
    one('codRtoTarget', `COD RTO % above ${R.codRtoTargetMax}%`, L.cod?.total ? L.cod.rto / L.cod.total * 100 : null, R.codRtoTargetMax, 'max', 'COD RTO')
    one('prepaidRtoTarget', `Prepaid RTO % above ${R.prepaidRtoTargetMax}%`, L.prepaid?.total ? L.prepaid.rto / L.prepaid.total * 100 : null, R.prepaidRtoTargetMax, 'max', 'Prepaid RTO')
    one('del3dTarget', `Delivered within 3 days of pickup below ${R.deliveredWithin3dOfPickupMin}%`, f.deliveredTotal ? f.within3dPickup / f.deliveredTotal * 100 : null, R.deliveredWithin3dOfPickupMin, 'min', 'Delivered ≤ 3 days after pickup')
    one('del5dTarget', `Delivered within 5 days of order below ${R.deliveredWithin5dOfOrderMin}%`, f.deliveredTotal ? f.within5dOrder / f.deliveredTotal * 100 : null, R.deliveredWithin5dOfOrderMin, 'min', 'Delivered ≤ 5 days after order')
  }

  // #22-#25 courier cost (B2C)
  if (T.cost?.perShipment != null && T.cost.perShipment > R.costPerShipmentMax) add('costPerShipment', 'target', () => `Cost per shipment above ₹${R.costPerShipmentMax}`, [{ entity: 'B2C courier', perm: 'logistics:cost:b2c', sev: tgtSev(T.cost.perShipment, R.costPerShipmentMax, 'max'), text: `${T.cost.month}: ₹${T.cost.perShipment.toFixed(1)} per shipment (target ≤ ₹${R.costPerShipmentMax})`, nav: { page: 'logistics-cost' } }], `Cost page, ${T.cost.month}`)
  if (cache.cost) {
    const c = cache.cost, nav = { page: 'logistics-cost' }, perm = 'logistics:cost:b2c'
    if (c.perKg != null && c.perKgTrailing && c.perKg > c.perKgTrailing * (1 + R.costPerKgUpPct / 100)) add('costPerKg', 'spike', () => 'Cost per kg above normal', [{ entity: 'B2C courier', perm, sev: 'amber', text: `${c.month}: ₹${c.perKg.toFixed(1)}/kg vs ₹${c.perKgTrailing.toFixed(1)} 3-month average (+${p1((c.perKg / c.perKgTrailing - 1) * 100)})`, nav }], 'B2C courier cost')
    if (c.freightPct != null && c.freightPctTrailing != null && c.freightPct - c.freightPctTrailing > R.freightPctUpPts) add('freightPct', 'spike', () => 'Freight as % of GMV up', [{ entity: 'B2C courier', perm, sev: 'amber', text: `${c.month}: ${p1(c.freightPct)} vs ${p1(c.freightPctTrailing)} 3-month average (+${(c.freightPct - c.freightPctTrailing).toFixed(1)} pts)`, nav }], 'B2C courier cost')
    const atoms = []
    for (const cr of c.invoice?.couriers || []) {
      if (!(cr.shipped > 0)) continue // skip couriers with no shipments that month
      if (cr.invoiced === 0) atoms.push({ entity: cr.courier, perm, sev: 'red', text: `${cr.courier}: no invoice data for ${c.invoice.expectedMonth}`, nav })
      else if (cr.coverage != null && cr.coverage < R.invoiceCoverageMin) atoms.push({ entity: cr.courier, perm, sev: 'amber', text: `${cr.courier}: invoices cover ${p1(cr.coverage * 100)} of ${c.invoice.expectedMonth} shipments`, nav })
    }
    add('invoiceMissing', 'spike', n => `Courier invoice not loaded: ${n}`, atoms, `Expected: ${c.invoice?.expectedMonth}`)
  }

  // #26-#28 customer (D2C)
  if (cache.customer?.cur) {
    const { cur, prevPeriod: pv } = cache.customer, nav = { page: 'customer' }
    if (cur.ltvCac != null && pv?.ltvCac != null && cur.ltvCac < CUSTOMER_RULES.ltvCacMin && pv.ltvCac < CUSTOMER_RULES.ltvCacMin) add('ltvCac', 'spike', () => `LTV:CAC below ${CUSTOMER_RULES.ltvCacMin}× for two periods`, [{ entity: 'D2C', perm: 'customer', sev: 'red', text: `${cur.ltvCac.toFixed(1)}× now, ${pv.ltvCac.toFixed(1)}× the 28 days before`, nav }], cache.windows.customer?.label)
    const d0 = cur.repPct - cur.repPrevPct, d1 = pv ? pv.repPct - pv.repPrevPct : null
    if (d1 != null && d0 <= -CUSTOMER_RULES.repeatRevDropPts && d1 <= -CUSTOMER_RULES.repeatRevDropPts) add('repeatRev', 'spike', () => 'Repeat revenue share down for two periods', [{ entity: 'D2C', perm: 'customer', sev: 'amber', text: `${p1(cur.repPct)} now (${d0.toFixed(1)} pts), the 28 days before ${d1.toFixed(1)} pts`, nav }], cache.windows.customer?.label)
    if (cur.discountGap != null && cur.discountGap > CUSTOMER_RULES.discountGapPts) add('discountGap', 'spike', () => 'Discount dependence rising', [{ entity: 'D2C', perm: 'customer', sev: 'amber', text: `Discounted first orders repeat ${cur.discountGap.toFixed(1)} pts more often (bar > ${CUSTOMER_RULES.discountGapPts})`, nav }], cache.windows.customer?.label)
  }

  // #29-#31 support (target and floors read from the Support page's own rules)
  if (cache.support?.day) {
    const nav = { page: 'customer-support' }, perm = 'customer:support', S = SUPPORT_RULES
    const frtAtoms = (frt, onlyChat) => (frt || []).filter(x => x.avgSec != null && x.n >= S.frtMinReplies && S.frtTargetSec[x.ch] != null && (onlyChat ? x.ch === 'Chat' : x.ch !== 'Chat') && x.avgSec > S.frtTargetSec[x.ch]).map(x => ({ entity: x.ch, perm, sev: tgtSev(x.avgSec, S.frtTargetSec[x.ch], 'max'), text: `${x.ch} ${(x.avgSec / 60).toFixed(0)} min vs ${(S.frtTargetSec[x.ch] / 60).toFixed(0)} min target`, nav }))
    add('frtSpike', 'spike', n => `First response time above target: ${n}`, frtAtoms(cache.support.day.frt, false), `Day ${cache.windows.support?.day}`)
    add('frtChatTarget', 'target', () => 'Chat first response above target', frtAtoms(T.support?.week?.frt, true), `Week of ${T.support?.week?.key}`)
    const { esc, escPrev, per, perPrev } = cache.support.day
    if (esc.inter >= R.supportEscMinInteractions && escPrev.inter >= R.supportEscMinInteractions) {
      const e1 = esc.esc / esc.inter, e0 = escPrev.esc / escPrev.inter, pts = (e1 - e0) * 100
      if (pts >= S.escalationUpPts) add('escalation', 'spike', () => 'Escalation rate up', [{ entity: 'Support', perm, sev: 'amber', text: `${p1(e1 * 100)} vs ${p1(e0 * 100)} (+${pts.toFixed(1)} pts) vs the same weekday last week`, nav }], `Day ${cache.windows.support?.day}`)
    }
    if (per.orders >= R.supportPer100MinOrders && perPrev.orders >= R.supportPer100MinOrders && per.inter != null && perPrev.inter) {
      const c1 = per.inter / per.orders * 100, c0 = perPrev.inter / perPrev.orders * 100, chg = (c1 - c0) / c0 * 100
      if (chg >= S.per100UpPct) add('per100', 'spike', () => 'Contacts per 100 orders up', [{ entity: 'Support', perm, sev: 'amber', text: `${c1.toFixed(0)} vs ${c0.toFixed(0)} (+${chg.toFixed(0)}%) vs the same weekday last week`, nav }], `Day ${cache.windows.support?.day}`)
    }
  }
  return out
}

const MAX_LINES = 6
// cache: parsed public/alerts-phase2.json (or null). viewer: { can(permKey) -> bool, isAdmin }
export function computePhase2Alerts(cache, viewer) {
  if (!cache) return { spikes: [], targets: [] }
  const canSee = perm => perm === 'admin' ? !!viewer.isAdmin : viewer.can(perm)
  const spikes = [], targets = []
  for (const r of rules(cache)) {
    const atoms = r.atoms.filter(a => canSee(a.perm)).sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'red' ? -1 : 1))
    if (!atoms.length) continue
    const names = [...new Set(atoms.map(a => ('titleName' in a ? a.titleName : a.entity)).filter(Boolean))] // channel x warehouse lines stay in the body only
    const shown = atoms.slice(0, MAX_LINES).map(a => a.text)
    const body = `${r.note ? r.note + ': ' : ''}${shown.join(' · ')}${atoms.length > MAX_LINES ? ` · +${atoms.length - MAX_LINES} more` : ''}`
    const type = atoms.some(a => a.sev === 'red') ? 'red' : 'amber'
    const alert = { type, title: r.title(names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4}` : '')), body, key: `p2:${r.rule}`, nav: atoms[0].nav, group: r.group }
    ;(r.group === 'target' ? targets : spikes).push(alert)
  }
  return { spikes, targets }
}
