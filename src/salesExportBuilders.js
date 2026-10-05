// Row builders for the sales export dialog.
//
// Each channel stores its numbers differently — D2C keeps day x SKU rows, Amazon splits
// Seller and Vendor Central, the quick-commerce channels are flatter — so the dialog owns
// the chrome and these own the shapes. A builder returns [{ id, name, rows }]; a sheet with
// no rows is dropped by the dialog rather than written empty.
//
// The figures here are lifted from the handlers these replace, so an exported number
// matches what the old menu produced for the same range.

const r0 = n => Math.round(Number(n) || 0)
const pct2 = (num, den) => (den > 0 ? parseFloat((num / den * 100).toFixed(2)) : 0)
const titleCase = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : s)

// Share of gross revenue that survives cancellations, RTO and courier-initiated returns.
// Clamped at 0: a month whose deductions exceed its gross (a late return against an earlier
// sale) would otherwise report negative net revenue.
const retainedShare = (gross, ...deductions) => {
  const g = Number(gross) || 0
  if (g <= 0) return 0
  return Math.max(0, 1 - deductions.reduce((a, d) => a + (Number(d) || 0), 0) / g)
}

// ── D2C / Shopify ──────────────────────────────────────────────────────────────────────
export function buildD2CReports(data, { reportIds, subChannel }) {
  const sh = (data || {}).shopify || {}
  const want = new Set(reportIds)
  const out = []

  // matrixSubCh null = Overall, which still excludes International and Retail Store: those
  // are separate tabs with their own numbers, and folding them in here would double-count
  // them against the channel comparison sheet.
  const matrixSubCh = (subChannel === 'MyFrido' || subChannel === 'Mobility') ? subChannel.toLowerCase() : null
  const dailySKU = sh.dailySKU || []
  const rows = matrixSubCh
    ? dailySKU.filter(r => (r.subChannel || '').toLowerCase() === matrixSubCh)
    : dailySKU.filter(r => !['shopify international', 'retail store'].includes((r.subChannel || '').toLowerCase()))

  const skuCat = {}
  Object.entries(sh.skuMap || {}).forEach(([cat, scMap]) => {
    Object.entries(scMap).forEach(([sc, skuMap]) => {
      Object.keys(skuMap).forEach(sku => { skuCat[sku] = { cat, sc } })
    })
  })

  if (want.has('sku')) {
    out.push({
      id: 'sku', name: 'Day-wise SKU',
      rows: rows.map(r => {
        const look = skuCat[r.sku] || { cat: 'Others', sc: 'Others' }
        const keep = retainedShare(r.rev, r.cancelRev, r.rtoRev, r.cirRev)
        return {
          'Date': r.date, 'Category': look.cat, 'Sub-Category': look.sc, 'SKU': r.sku,
          'Sub-Channel': r.subChannel || '', 'Units': r.units || 0,
          'Gross Revenue': r0(r.rev), 'Net Revenue': r0((r.excRev || 0) * keep),
          'Return Units': r.returnUnits || 0,
        }
      }),
    })
  }

  if (want.has('returns')) {
    // Aggregated to SKU rather than left per-day: a returns review is about which products
    // leak revenue, and a day-level row for a SKU with three orders a week is noise.
    const bySku = new Map()
    for (const r of rows) {
      const e = bySku.get(r.sku) || { units: 0, rev: 0, cancelRev: 0, rtoRev: 0, cirRev: 0, returnUnits: 0 }
      e.units += r.units || 0; e.rev += r.rev || 0
      e.cancelRev += r.cancelRev || 0; e.rtoRev += r.rtoRev || 0; e.cirRev += r.cirRev || 0
      e.returnUnits += r.returnUnits || 0
      bySku.set(r.sku, e)
    }
    out.push({
      id: 'returns', name: 'Returns & RTO',
      rows: [...bySku.entries()]
        .filter(([, v]) => v.rev > 0)
        .sort((a, b) => (b[1].cancelRev + b[1].rtoRev + b[1].cirRev) - (a[1].cancelRev + a[1].rtoRev + a[1].cirRev))
        .map(([sku, v]) => {
          const look = skuCat[sku] || { cat: 'Others', sc: 'Others' }
          const lost = v.cancelRev + v.rtoRev + v.cirRev
          return {
            'Category': look.cat, 'Sub-Category': look.sc, 'SKU': sku,
            'Units': v.units, 'Return Units': v.returnUnits,
            'Gross Revenue': r0(v.rev),
            'Cancelled': r0(v.cancelRev), 'RTO': r0(v.rtoRev), 'CIR': r0(v.cirRev),
            'Total Lost': r0(lost),
            'Lost %': pct2(lost, v.rev),
            'Retained %': parseFloat((retainedShare(v.rev, lost) * 100).toFixed(2)),
          }
        }),
    })
  }

  if (want.has('category')) {
    const byCat = new Map()
    for (const r of rows) {
      const look = skuCat[r.sku] || { cat: 'Others', sc: 'Others' }
      const k = `${look.cat}|${look.sc}`
      const e = byCat.get(k) || { cat: look.cat, sc: look.sc, units: 0, rev: 0, excRev: 0, lost: 0, returnUnits: 0 }
      e.units += r.units || 0; e.rev += r.rev || 0; e.excRev += r.excRev || 0
      e.lost += (r.cancelRev || 0) + (r.rtoRev || 0) + (r.cirRev || 0)
      e.returnUnits += r.returnUnits || 0
      byCat.set(k, e)
    }
    const total = [...byCat.values()].reduce((s, v) => s + v.rev, 0)
    out.push({
      id: 'category', name: 'Category Revenue',
      rows: [...byCat.values()].sort((a, b) => b.rev - a.rev).map(v => ({
        'Category': v.cat, 'Sub-Category': v.sc, 'Units': v.units,
        'Gross Revenue': r0(v.rev),
        'Net Revenue': r0(v.excRev * retainedShare(v.rev, v.lost)),
        'Return Units': v.returnUnits,
        'Lost %': pct2(v.lost, v.rev),
        'AOV': v.units ? r0(v.rev / v.units) : 0,
        'Share (out of 100)': pct2(v.rev, total),
      })),
    })
  }

  if (want.has('states')) {
    const stateMap = sh.stateMap || {}
    const stTotal = Object.values(stateMap).reduce((s, v) => s + (v.rev || 0), 0)
    out.push({
      id: 'states', name: 'Top States',
      rows: Object.entries(stateMap)
        .map(([state, v]) => ({ state, rev: v.rev || 0, orders: v.orders || 0, cities: v.cities || 0 }))
        .sort((a, b) => b.rev - a.rev)
        .map(s => ({
          'State': titleCase(s.state), 'Revenue': r0(s.rev), 'Orders': s.orders, 'Cities': s.cities,
          'AOV': s.orders ? r0(s.rev / s.orders) : 0,
          'Share (out of 100)': pct2(s.rev, stTotal),
        })),
    })
    const cityRows = sh.cityRows || []
    const ctTotal = cityRows.reduce((s, r) => s + (r.rev || 0), 0)
    out.push({
      id: 'cities', name: 'Top Cities',
      rows: cityRows.map(c => ({
        'City': c.city, 'State': c.state || '', 'Region': c.region || '', 'City Tier': c.cityTier || '',
        'Revenue': r0(c.rev), 'Orders': c.orders || 0,
        'AOV': c.orders ? r0(c.rev / c.orders) : 0,
        'Share (out of 100)': pct2(c.rev, ctTotal),
      })),
    })
  }

  if (want.has('channels')) {
    // Sub-channel split within D2C. The cross-channel comparison (D2C vs Amazon vs …) lives
    // on the All-channels tab, which is the only place that holds every channel's numbers.
    const bySub = new Map()
    for (const r of dailySKU) {
      const k = r.subChannel || '(unknown)'
      const e = bySub.get(k) || { units: 0, rev: 0, excRev: 0, lost: 0 }
      e.units += r.units || 0; e.rev += r.rev || 0; e.excRev += r.excRev || 0
      e.lost += (r.cancelRev || 0) + (r.rtoRev || 0) + (r.cirRev || 0)
      bySub.set(k, e)
    }
    const total = [...bySub.values()].reduce((s, v) => s + v.rev, 0)
    out.push({
      id: 'channels', name: 'Sub-Channel Split',
      rows: [...bySub.entries()].sort((a, b) => b[1].rev - a[1].rev).map(([k, v]) => ({
        'Sub-Channel': k, 'Units': v.units, 'Gross Revenue': r0(v.rev),
        'Net Revenue': r0(v.excRev * retainedShare(v.rev, v.lost)),
        'AOV': v.units ? r0(v.rev / v.units) : 0,
        'Lost %': pct2(v.lost, v.rev),
        'Share (out of 100)': pct2(v.rev, total),
      })),
    })
  }

  return out
}
