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

  // Returns are not a separate sheet. Cancel/RTO/CIR are measures of the SAME rows every
  // other sheet is built from, so they belong as columns on each roll-up rather than in a
  // file of their own — otherwise a reader comparing a SKU's revenue against its RTO has to
  // join two tabs by hand, and "Day-wise & SKU" plus "Returns & RTO" means downloading the
  // same numbers twice at two different grains.
  const lossCols = v => {
    const lost = (v.cancelRev || 0) + (v.rtoRev || 0) + (v.cirRev || 0)
    return {
      'Cancelled': r0(v.cancelRev), 'RTO': r0(v.rtoRev), 'CIR': r0(v.cirRev),
      'Total Lost': r0(lost),
      'Lost %': pct2(lost, v.rev),
      'Retained %': parseFloat((retainedShare(v.rev, lost) * 100).toFixed(2)),
    }
  }

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
          ...lossCols(r),
        }
      }),
    })
  }

  // SKU totals for the period. The day-wise sheet answers "what happened on the 12th";
  // this one answers "which products leak revenue", which is the question the old separate
  // returns sheet existed for — and it carries the same loss columns.
  if (want.has('skuTotals')) {
    const bySku = new Map()
    for (const r of rows) {
      const e = bySku.get(r.sku) || { units: 0, rev: 0, excRev: 0, cancelRev: 0, rtoRev: 0, cirRev: 0, returnUnits: 0 }
      e.units += r.units || 0; e.rev += r.rev || 0; e.excRev += r.excRev || 0
      e.cancelRev += r.cancelRev || 0; e.rtoRev += r.rtoRev || 0; e.cirRev += r.cirRev || 0
      e.returnUnits += r.returnUnits || 0
      bySku.set(r.sku, e)
    }
    const total = [...bySku.values()].reduce((s, v) => s + v.rev, 0)
    out.push({
      id: 'skuTotals', name: 'SKU Totals',
      rows: [...bySku.entries()]
        .filter(([, v]) => v.rev > 0)
        .sort((a, b) => b[1].rev - a[1].rev)
        .map(([sku, v]) => {
          const look = skuCat[sku] || { cat: 'Others', sc: 'Others' }
          const lost = v.cancelRev + v.rtoRev + v.cirRev
          return {
            'Category': look.cat, 'Sub-Category': look.sc, 'SKU': sku,
            'Units': v.units, 'Return Units': v.returnUnits,
            'Gross Revenue': r0(v.rev),
            'Net Revenue': r0(v.excRev * retainedShare(v.rev, lost)),
            'AOV': v.units ? r0(v.rev / v.units) : 0,
            ...lossCols(v),
            'Share (out of 100)': pct2(v.rev, total),
          }
        }),
    })
  }

  if (want.has('category')) {
    const byCat = new Map()
    for (const r of rows) {
      const look = skuCat[r.sku] || { cat: 'Others', sc: 'Others' }
      const k = `${look.cat}|${look.sc}`
      // cancelRev/rtoRev/cirRev kept apart rather than summed on the way in: the three have
      // different causes and different owners, and a single "lost" total cannot be split
      // back out once added.
      const e = byCat.get(k) || { cat: look.cat, sc: look.sc, units: 0, rev: 0, excRev: 0, cancelRev: 0, rtoRev: 0, cirRev: 0, returnUnits: 0 }
      e.units += r.units || 0; e.rev += r.rev || 0; e.excRev += r.excRev || 0
      e.cancelRev += r.cancelRev || 0; e.rtoRev += r.rtoRev || 0; e.cirRev += r.cirRev || 0
      e.returnUnits += r.returnUnits || 0
      byCat.set(k, e)
    }
    const total = [...byCat.values()].reduce((s, v) => s + v.rev, 0)
    out.push({
      id: 'category', name: 'Category Revenue',
      rows: [...byCat.values()].sort((a, b) => b.rev - a.rev).map(v => {
        const lost = v.cancelRev + v.rtoRev + v.cirRev
        return {
          'Category': v.cat, 'Sub-Category': v.sc, 'Units': v.units,
          'Gross Revenue': r0(v.rev),
          'Net Revenue': r0(v.excRev * retainedShare(v.rev, lost)),
          'Return Units': v.returnUnits,
          'AOV': v.units ? r0(v.rev / v.units) : 0,
          ...lossCols(v),
          'Share (out of 100)': pct2(v.rev, total),
        }
      }),
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
      const e = bySub.get(k) || { units: 0, rev: 0, excRev: 0, cancelRev: 0, rtoRev: 0, cirRev: 0, returnUnits: 0 }
      e.units += r.units || 0; e.rev += r.rev || 0; e.excRev += r.excRev || 0
      e.cancelRev += r.cancelRev || 0; e.rtoRev += r.rtoRev || 0; e.cirRev += r.cirRev || 0
      e.returnUnits += r.returnUnits || 0
      bySub.set(k, e)
    }
    const total = [...bySub.values()].reduce((s, v) => s + v.rev, 0)
    out.push({
      id: 'channels', name: 'Sub-Channel Split',
      rows: [...bySub.entries()].sort((a, b) => b[1].rev - a[1].rev).map(([k, v]) => {
        const lost = v.cancelRev + v.rtoRev + v.cirRev
        return {
          'Sub-Channel': k, 'Units': v.units, 'Return Units': v.returnUnits,
          'Gross Revenue': r0(v.rev),
          'Net Revenue': r0(v.excRev * retainedShare(v.rev, lost)),
          'AOV': v.units ? r0(v.rev / v.units) : 0,
          ...lossCols(v),
          'Share (out of 100)': pct2(v.rev, total),
        }
      }),
    })
  }

  return out
}

// ── Quick-commerce and marketplace channels ────────────────────────────────────────────
// Blinkit, Instamart, Zepto, CRED, FirstCry and Myntra all arrive in the same shape:
// skuMatrix as cat -> subCat -> sku, a `daily` array, and flat `states` / `cities` lists.
// The only real difference is that the marketplace three carry returnRev while the
// quick-commerce three do not, so the loss columns are emitted only where that field
// exists rather than padded with zeros that would read as "no returns".
//
// `dataKey` is the channel's slot on the payload ('blinkit', 'cred', …).
export function buildFlatChannelReports(data, { reportIds, dataKey }) {
  const ch = (data || {})[dataKey] || {}
  const want = new Set(reportIds)
  const out = []
  const hasReturns = (() => {
    for (const scMap of Object.values(ch.skuMatrix || {})) {
      for (const skuMap of Object.values(scMap || {})) {
        for (const v of Object.values(skuMap || {})) if (v && v.returnRev != null) return true
      }
    }
    return false
  })()

  // Flatten skuMatrix once; every roll-up below is built from this rather than re-walking
  // the three-level object.
  const flat = []
  Object.entries(ch.skuMatrix || {}).forEach(([cat, scMap]) => {
    Object.entries(scMap || {}).forEach(([sc, skuMap]) => {
      Object.entries(skuMap || {}).forEach(([sku, v]) => {
        if (!v?.rev) return
        flat.push({
          cat, sc, sku,
          units: v.units || 0, orders: v.orders || 0,
          rev: v.rev || 0, excRev: v.excRev || 0, returnRev: v.returnRev || 0,
        })
      })
    })
  })
  const grossTotal = flat.reduce((s, r) => s + r.rev, 0)

  const lossCols = v => (hasReturns ? {
    'Return Rev': r0(v.returnRev),
    'Lost %': pct2(v.returnRev, v.rev),
    'Retained %': parseFloat((retainedShare(v.rev, v.returnRev) * 100).toFixed(2)),
  } : {})

  if (want.has('sku')) {
    out.push({
      id: 'sku', name: 'Day-wise',
      rows: (ch.daily || []).map(r => ({
        'Date': r.date, 'Orders': r.orders || 0, 'Units': r.units || 0,
        'Gross Revenue': r0(r.rev), 'Net Revenue (Ex GST)': r0(r.excRev),
      })),
    })
  }

  if (want.has('skuTotals')) {
    out.push({
      id: 'skuTotals', name: 'SKU Totals',
      rows: flat.slice().sort((a, b) => b.rev - a.rev).map(v => ({
        'Category': v.cat, 'Sub-Category': v.sc, 'SKU': v.sku,
        'Units': v.units, 'Orders': v.orders,
        'Gross Revenue': r0(v.rev),
        'Net Revenue': r0(v.excRev * retainedShare(v.rev, v.returnRev)),
        'AOV': v.units ? r0(v.rev / v.units) : 0,
        ...lossCols(v),
        'Share (out of 100)': pct2(v.rev, grossTotal),
      })),
    })
  }

  if (want.has('category')) {
    const byCat = new Map()
    for (const r of flat) {
      const k = `${r.cat}|${r.sc}`
      const e = byCat.get(k) || { cat: r.cat, sc: r.sc, units: 0, orders: 0, rev: 0, excRev: 0, returnRev: 0 }
      e.units += r.units; e.orders += r.orders; e.rev += r.rev; e.excRev += r.excRev; e.returnRev += r.returnRev
      byCat.set(k, e)
    }
    out.push({
      id: 'category', name: 'Category Revenue',
      rows: [...byCat.values()].sort((a, b) => b.rev - a.rev).map(v => ({
        'Category': v.cat, 'Sub-Category': v.sc, 'Units': v.units, 'Orders': v.orders,
        'Gross Revenue': r0(v.rev),
        'Net Revenue': r0(v.excRev * retainedShare(v.rev, v.returnRev)),
        'AOV': v.units ? r0(v.rev / v.units) : 0,
        ...lossCols(v),
        'Share (out of 100)': pct2(v.rev, grossTotal),
      })),
    })
  }

  if (want.has('states')) {
    const states = ch.states || [], cities = ch.cities || []
    const stTotal = ch.stateTotal || states.reduce((s, x) => s + (x.rev || 0), 0)
    const ctTotal = ch.cityTotal || cities.reduce((s, x) => s + (x.rev || 0), 0)
    out.push({
      id: 'states', name: 'Top States',
      rows: states.map(s => ({
        'State': titleCase(s.state), 'Revenue': r0(s.rev), 'Orders': s.orders || 0,
        'AOV': s.orders ? r0(s.rev / s.orders) : 0,
        'Share (out of 100)': pct2(s.rev, stTotal),
      })),
    })
    out.push({
      id: 'cities', name: 'Top Cities',
      rows: cities.map(c => ({
        'City': c.city, 'Region': c.region || '', 'City Tier': c.cityTier || '',
        'Revenue': r0(c.rev), 'Orders': c.orders || 0,
        'AOV': c.orders ? r0(c.rev / c.orders) : 0,
        'Share (out of 100)': pct2(c.rev, ctTotal),
      })),
    })

    // Region and tier roll-ups, which the quick-commerce exports carried as their own
    // sheets. Derived from cities because that is the only level holding either field.
    const reg = new Map(), tier = new Map()
    for (const c of cities) {
      if (c.region) {
        const e = reg.get(c.region) || { rev: 0, orders: 0 }
        e.rev += c.rev || 0; e.orders += c.orders || 0; reg.set(c.region, e)
      }
      if (c.cityTier) {
        const k = `Tier ${c.cityTier}`
        const e = tier.get(k) || { rev: 0, orders: 0 }
        e.rev += c.rev || 0; e.orders += c.orders || 0; tier.set(k, e)
      }
    }
    const rgTotal = [...reg.values()].reduce((s, v) => s + v.rev, 0)
    const trTotal = [...tier.values()].reduce((s, v) => s + v.rev, 0)
    if (reg.size) out.push({
      id: 'regions', name: 'Region Breakdown',
      rows: [...reg.entries()].sort((a, b) => b[1].rev - a[1].rev).map(([k, v]) => ({
        'Region': k, 'Revenue': r0(v.rev), 'Orders': v.orders, 'Share (out of 100)': pct2(v.rev, rgTotal),
      })),
    })
    if (tier.size) out.push({
      id: 'tiers', name: 'City Tier Breakdown',
      rows: [...tier.entries()].sort((a, b) => b[1].rev - a[1].rev).map(([k, v]) => ({
        'City Tier': k, 'Revenue': r0(v.rev), 'Orders': v.orders, 'Share (out of 100)': pct2(v.rev, trTotal),
      })),
    })
  }

  return out
}
