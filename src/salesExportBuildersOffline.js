// Offline export builder (B2B, Stockist, MTGT, misc).
//
// Kept in its own file rather than folded into salesExportBuilders.js: this channel shares
// none of the others' shapes. It is billed rather than ordered, so revenue is reduced by
// CREDIT NOTES instead of cancellations or RTO, and the tab's own sub-channel toggle has to
// filter every sheet.
//
// Its arrays arrive flat (skuRows, stateRows, cityRows, …) rather than as nested matrices,
// so each sheet is a group-by rather than a tree walk.

const r0 = n => Math.round(Number(n) || 0)
const pct2 = (num, den) => (den > 0 ? parseFloat((num / den * 100).toFixed(2)) : 0)
const titleCase = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : s)

// Credit notes arrive negative on some rows and positive on others, so each is abs()'d
// before summing — otherwise the two signs cancel and a month of returns reports as zero.
const cn = v => Math.abs(Number(v) || 0)

export function buildOfflineReports(data, { reportIds, offlineSub = 'all' }) {
  const off = (data || {}).offline || {}
  const want = new Set(reportIds)
  const out = []

  const isB2B = sc => sc === 'Shopify B2B' || String(sc || '').startsWith('Offline_B2B')
  const isStockist = sc => String(sc || '').startsWith('Stockist')

  // Mirrors the tab's own filterOffSub exactly. A mismatch here would not just change the
  // slice — it would have the file disagree with the figures on screen.
  const keep = rows => {
    const list = rows || []
    if (offlineSub === 'all' || !offlineSub) return list
    if (offlineSub === 'b2b') return list.filter(r => isB2B(r.subChannel))
    if (offlineSub === 'Stockist') return list.filter(r => isStockist(r.subChannel))
    if (offlineSub === 'MTGT') return list.filter(r => r.subChannel === 'MTGT')
    if (offlineSub === 'misc') return list.filter(r => !isB2B(r.subChannel) && !isStockist(r.subChannel) && r.subChannel !== 'MTGT')
    return list.filter(r => r.subChannel === offlineSub)
  }

  if (want.has('sku')) {
    const m = new Map()
    for (const d of keep(off.daily)) {
      const e = m.get(d.date) || { date: d.date, rev: 0, excRev: 0, cnRev: 0, cnExcRev: 0, orders: 0, units: 0 }
      e.rev += d.rev || 0; e.excRev += d.excRev || 0
      e.cnRev += cn(d.cnRev); e.cnExcRev += cn(d.cnExcRev)
      e.orders += d.orders || 0; e.units += d.units || 0
      m.set(d.date, e)
    }
    out.push({
      id: 'sku', name: 'Day-wise',
      rows: [...m.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))).map(r => ({
        'Date': r.date, 'Orders': r.orders, 'Units': r.units,
        'Gross Revenue': r0(r.rev), 'Credit Notes': r0(r.cnRev),
        'Net Revenue': r0(r.excRev - r.cnExcRev),
        'Credit Note %': pct2(r.cnRev, r.rev),
      })),
    })
  }

  if (want.has('skuTotals') || want.has('category')) {
    const rows = keep(off.skuRows)
    const roll = (keyFn, labelFn) => {
      const m = new Map()
      for (const x of rows) {
        const k = keyFn(x)
        const e = m.get(k) || { ...labelFn(x), units: 0, orders: 0, rev: 0, excRev: 0, cnRev: 0 }
        e.units += x.units || 0; e.orders += x.orders || 0
        e.rev += x.rev || 0; e.excRev += x.excRev || 0; e.cnRev += cn(x.cnRev)
        m.set(k, e)
      }
      return [...m.values()].sort((a, b) => b.rev - a.rev)
    }

    if (want.has('skuTotals')) {
      const agg = roll(
        x => x.category + '::' + x.subCategory + '::' + x.sku,
        x => ({ cat: x.category, sc: x.subCategory, sku: x.sku }),
      )
      const total = agg.reduce((s, v) => s + v.rev, 0)
      out.push({
        id: 'skuTotals', name: 'SKU Totals',
        rows: agg.map(v => ({
          'Category': v.cat, 'Sub-Category': v.sc, 'SKU': v.sku,
          'Units': v.units, 'Orders': v.orders,
          'Gross Revenue': r0(v.rev), 'Credit Notes': r0(v.cnRev),
          'Net Revenue (Ex GST)': r0(v.excRev),
          'AOV': v.units ? r0(v.rev / v.units) : 0,
          'Credit Note %': pct2(v.cnRev, v.rev),
          'Share (out of 100)': pct2(v.rev, total),
        })),
      })
    }

    if (want.has('category')) {
      const agg = roll(
        x => x.category + '::' + x.subCategory,
        x => ({ cat: x.category, sc: x.subCategory }),
      )
      const total = agg.reduce((s, v) => s + v.rev, 0)
      out.push({
        id: 'category', name: 'Category Revenue',
        rows: agg.map(v => ({
          'Category': v.cat, 'Sub-Category': v.sc,
          'Units': v.units, 'Orders': v.orders,
          'Gross Revenue': r0(v.rev), 'Credit Notes': r0(v.cnRev),
          'Net Revenue (Ex GST)': r0(v.excRev),
          'AOV': v.units ? r0(v.rev / v.units) : 0,
          'Credit Note %': pct2(v.cnRev, v.rev),
          'Share (out of 100)': pct2(v.rev, total),
        })),
      })
    }
  }

  // Deliberately NOT filtered by offlineSub: this sheet exists to compare the sub-channels
  // against each other, and narrowing it to one would leave a single row.
  if (want.has('channels')) {
    const m = new Map()
    for (const x of off.skuRows || []) {
      const k = x.subChannel || '(unknown)'
      const e = m.get(k) || { units: 0, orders: 0, rev: 0, excRev: 0, cnRev: 0 }
      e.units += x.units || 0; e.orders += x.orders || 0
      e.rev += x.rev || 0; e.excRev += x.excRev || 0; e.cnRev += cn(x.cnRev)
      m.set(k, e)
    }
    const total = [...m.values()].reduce((s, v) => s + v.rev, 0)
    out.push({
      id: 'channels', name: 'Sub-Channel Split',
      rows: [...m.entries()].sort((a, b) => b[1].rev - a[1].rev).map(([k, v]) => ({
        'Sub-Channel': k, 'Units': v.units, 'Orders': v.orders,
        'Gross Revenue': r0(v.rev), 'Credit Notes': r0(v.cnRev),
        'Net Revenue (Ex GST)': r0(v.excRev),
        'AOV': v.units ? r0(v.rev / v.units) : 0,
        'Share (out of 100)': pct2(v.rev, total),
      })),
    })
  }

  if (want.has('states')) {
    const agg = (rows, labelFn) => {
      const m = new Map()
      for (const r of keep(rows)) {
        const k = labelFn(r)
        if (k == null) continue
        const e = m.get(k) || { rev: 0, orders: 0 }
        e.rev += r.rev || 0; e.orders += r.orders || 0
        m.set(k, e)
      }
      const total = [...m.values()].reduce((s, v) => s + v.rev, 0)
      return [...m.entries()].sort((a, b) => b[1].rev - a[1].rev).map(([k, v]) => ({ k, ...v, total }))
    }

    const st = agg(off.stateRows, r => r.state)
    if (st.length) out.push({
      id: 'states', name: 'Top States',
      rows: st.map(x => ({
        'State': titleCase(x.k), 'Revenue': r0(x.rev), 'Orders': x.orders,
        'AOV': x.orders ? r0(x.rev / x.orders) : 0, 'Share (out of 100)': pct2(x.rev, x.total),
      })),
    })

    const ct = agg(off.cityRows, r => r.city)
    if (ct.length) out.push({
      id: 'cities', name: 'Top Cities',
      rows: ct.map(x => ({
        'City': x.k, 'Revenue': r0(x.rev), 'Orders': x.orders,
        'AOV': x.orders ? r0(x.rev / x.orders) : 0, 'Share (out of 100)': pct2(x.rev, x.total),
      })),
    })

    const rg = agg(off.regionRows, r => r.region)
    if (rg.length) out.push({
      id: 'regions', name: 'Region Breakdown',
      rows: rg.map(x => ({ 'Region': x.k, 'Revenue': r0(x.rev), 'Orders': x.orders, 'Share (out of 100)': pct2(x.rev, x.total) })),
    })

    const tr = agg(off.tierRows, r => r.label || (r.tier != null ? 'Tier ' + r.tier : null))
    if (tr.length) out.push({
      id: 'tiers', name: 'City Tier Breakdown',
      rows: tr.map(x => ({ 'City Tier': x.k, 'Revenue': r0(x.rev), 'Orders': x.orders, 'Share (out of 100)': pct2(x.rev, x.total) })),
    })
  }

  return out
}
