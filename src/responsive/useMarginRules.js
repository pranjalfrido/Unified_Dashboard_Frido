import { useMemo } from 'react'
import { PNL_RULE_BARS, PNL_RULE_BAR_OVERRIDES, PNL_CHANNEL_GROUP, PNL_MATERIALITY, PNL_WATCHLIST_EXCLUDE } from '../config/metricTargets.js'
import { breakevenRoas, roasForTargetCm2 } from '../pnl/pnlUtils.js'

// P&L margin watchlist engine (PNL_MASTER_PLAN.md Part B §1), shared by the laptop watchlist / matrix /
// biggest fixes / Financial View flags and the mobile cards. It only READS the Financial View's own
// product rows (src/pnl/financialRows.js) and the previous period's per-product totals; every % is
// the table's own value. A rule whose inputs don't exist on the tab is not returned at all.
//
// rows:     buildFinancialRows().allRows ({ cat, sc, gross, excRev, net, units, totalReturnRev,
//           returnPct, cogsPct, gmPct, cm1, cm1Pct, spend, cm2, cm2Pct, roas, ... })
// tab:      P&L tab id (bars from PNL_CHANNEL_GROUP / PNL_RULE_BARS)
// avail:    { cm1, cogs, ret, spend } — which inputs exist on this tab (spend = real ad spend)
// prevRows: { 'cat::sc': { gross, units, returnRev } } for the previous equal-length period, or null
const AD_GRAIN = 'Ad spend is attributed at sub-category grain (the product rows here), so this flag works at that grain too.'
export const RULES = [
  { id: 'loss', chip: 'Loss', name: () => 'Loss after ads', needs: ['spend'], what: () => 'loss',
    info: () => `CM2 below zero: the same test as ROAS below the product's breakeven ROAS. ${AD_GRAIN}` },
  { id: 'thin', chip: 'ROAS', name: () => 'Below healthy ROAS', needs: ['spend', 'cm2Target'], what: b => `to ${b.cm2Target}% CM2`,
    info: b => `CM2 between 0 and ${b.cm2Target}%: ROAS below the "CM2 @ ${b.cm2Target}%" ROAS of the Breakeven ROAS calculator. ${AD_GRAIN}` },
  { id: 'cm1', chip: 'CM1', name: b => `CM1 < ${b.cm1}%`, needs: ['cm1'], what: b => `below ${b.cm1}%` },
  { id: 'ret', chip: 'Returns', name: b => `Returns > ${b.ret}%`, needs: ['ret'], what: () => 'returned' },
  { id: 'cogs', chip: 'COGS', name: b => `COGS > ${b.cogs}%`, needs: ['cogs'], what: b => `over ${b.cogs}%` },
  { id: 'gm', chip: 'GM', name: b => `GM < ${b.gm}%`, needs: ['gm'], what: b => `below ${b.gm}%` },
  { id: 'asp', chip: 'ASP ↓', name: b => `ASP down > ${b.aspDrop}%`, needs: ['prev'], what: () => 'price given up' },
  { id: 'retup', chip: 'Returns ↑', name: b => `Returns up > ${b.retUp} pts`, needs: ['ret', 'prev'], what: () => 'extra returns' },
]
// Flag chip order on a product (Part B §3.4)
export const CHIP_ORDER = ['loss', 'cm1', 'cogs', 'gm', 'ret', 'retup', 'asp', 'thin']

export function computeMarginRules({ rows = [], tab, avail = {}, prevRows = null }) {
  const group = PNL_CHANNEL_GROUP[tab]
  const bars = group ? { ...PNL_RULE_BARS[group], ...PNL_RULE_BAR_OVERRIDES[tab] } : null
  if (!bars) return null
  const have = {
    cm1: !!avail.cm1 && bars.cm1 != null, cogs: !!avail.cogs && bars.cogs != null, gm: !!avail.cogs && bars.gm != null, ret: !!avail.ret && bars.ret != null,
    spend: !!avail.spend, cm2Target: bars.cm2Target != null, prev: !!prevRows,
  }
  const live = RULES.filter(r => r.needs.every(n => have[n]) && (r.id !== 'retup' || bars.retUp != null))
  const liveIds = new Set(live.map(r => r.id))
  const tabGross = rows.reduce((s, r) => s + (r.gross || 0), 0)
  const material = r => (r.gross || 0) >= tabGross * PNL_MATERIALITY.minShareOfGross || (r.units || 0) >= PNL_MATERIALITY.minUnits

  const byRule = Object.fromEntries(live.map(r => [r.id, []]))
  const flagsByKey = {}
  const derived = {}
  let small = 0, excluded = 0
  rows.forEach(r => {
    const key = `${r.cat}::${r.sc}`
    const prev = prevRows?.[key]
    const asp = r.units > 0 ? r.gross / r.units : null
    const prevAsp = prev && prev.units > 0 ? prev.gross / prev.units : null
    const prevRetPct = prev && prev.gross > 0 ? prev.returnRev / prev.gross * 100 : null
    derived[key] = {
      beRoas: breakevenRoas(r.excRev, r.cm1),
      roasNeeded: bars.cm2Target != null ? roasForTargetCm2(r.excRev, r.cm1, r.net, bars.cm2Target / 100) : null,
      asp, prevAsp, prevRetPct, material: false, excluded: PNL_WATCHLIST_EXCLUDE.has(r.sc),
    }
    // "Others" keeps its table values (BE ROAS etc.) but is never checked or put in the matrix
    if (derived[key].excluded) { excluded++; return }
    derived[key].material = material(r)
    if (!derived[key].material) { small++; return }
    const hits = []
    const add = (id, impact) => { if (!liveIds.has(id)) return; byRule[id].push({ row: r, key, impact }); hits.push(id) }
    if (r.cm2 != null && r.cm2 < 0) add('loss', r.cm2)
    else if (r.cm2Pct != null && bars.cm2Target != null && r.cm2Pct < bars.cm2Target) add('thin', -((bars.cm2Target - r.cm2Pct) / 100) * r.net)
    if (r.cm1Pct != null && r.cm1Pct < bars.cm1) add('cm1', -((bars.cm1 - r.cm1Pct) / 100) * r.net)
    if (r.cogsPct != null && r.cogsPct > bars.cogs) add('cogs', -((r.cogsPct - bars.cogs) / 100) * r.net)
    if (r.gmPct != null && r.gmPct < bars.gm) add('gm', -((bars.gm - r.gmPct) / 100) * r.net)
    if (bars.ret != null && r.gross > 0 && r.returnPct > bars.ret) add('ret', -(r.totalReturnRev || 0))
    if (prevRetPct != null && bars.retUp != null && r.gross > 0 && r.returnPct - prevRetPct > bars.retUp) add('retup', -((r.returnPct - prevRetPct) / 100) * r.gross)
    if (asp != null && prevAsp > 0 && (asp - prevAsp) / prevAsp * 100 < -bars.aspDrop) add('asp', -(prevAsp - asp) * r.units)
    if (hits.length) flagsByKey[key] = CHIP_ORDER.filter(id => hits.includes(id))
  })

  const rules = live.map(def => {
    const items = byRule[def.id].sort((a, b) => a.impact - b.impact)
    return {
      id: def.id, chip: def.chip, red: def.id === 'loss', name: def.name(bars), what: def.what(bars), info: def.info ? def.info(bars) : null,
      items, count: items.length,
      impact: items.reduce((s, x) => s + x.impact, 0),
      revenue: items.reduce((s, x) => s + (x.row.gross || 0), 0),
    }
  })
  return {
    bars, group, rules, flagsByKey, derived,
    smallCount: small, excludedCount: excluded, checkedCount: rows.length - small - excluded,
    triggered: rules.filter(r => r.count > 0).length,
    flaggedProducts: Object.keys(flagsByKey).length,
    ruleName: Object.fromEntries(rules.map(r => [r.id, r.name])),
  }
}

export function useMarginRules({ rows, tab, avail = {}, prevRows }) {
  const { cm1, cogs, ret, spend } = avail
  return useMemo(() => computeMarginRules({ rows, tab, avail: { cm1, cogs, ret, spend }, prevRows }), [rows, tab, cm1, cogs, ret, spend, prevRows])
}
