// All-Channels export builder.
//
// The only tab holding every channel at once, so this is where a genuine channel
// comparison belongs — the per-channel tabs can only ever split themselves.
//
// Its data sits at the top level of the payload rather than under a channel key: chMap for
// channel totals, catMap / subCatMap for the category tree, skuRows flat with snake_case
// fields, and stateMap / cityRows for geography.

const r0 = n => Math.round(Number(n) || 0)
const pct2 = (num, den) => (den > 0 ? parseFloat((num / den * 100).toFixed(2)) : 0)
const titleCase = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : s)

const retainedShare = (gross, ...deductions) => {
  const g = Number(gross) || 0
  if (g <= 0) return 0
  return Math.max(0, 1 - deductions.reduce((a, d) => a + (Number(d) || 0), 0) / g)
}

// orders arrives as either a Set (counted by size) or a plain number depending on which
// aggregation produced it, so both are handled rather than assuming one.
const orderCount = v => (v?.orders?.size ?? v?.orders ?? 0)

export function buildAllChannelReports(data, { reportIds }) {
  const d = data || {}
  const want = new Set(reportIds)
  const out = []

  const chMap = d.chMap || {}
  const catMap = d.catMap || {}
  const subCatMap = d.subCatMap || {}
  const skuRows = d.skuRows || []
  const totalRev = Object.values(chMap).reduce((s, v) => s + (v.rev || 0), 0)

  // Units per channel live on the daily array as `<channel>_u` columns rather than on
  // chMap, so they are summed across days here.
  const unitsByCh = {}
  const channels = Object.keys(chMap)
  for (const day of d.dailyArr || []) {
    for (const ch of channels) unitsByCh[ch] = (unitsByCh[ch] || 0) + (day[`${ch}_u`] || 0)
  }

  if (want.has('channels')) {
    out.push({
      id: 'channels', name: 'Channel Comparison',
      rows: Object.entries(chMap)
        .filter(([, v]) => (v.rev || 0) > 0)
        .sort((a, b) => (b[1].rev || 0) - (a[1].rev || 0))
        .map(([ch, v]) => {
          const units = unitsByCh[ch] || v.units || 0
          const orders = orderCount(v)
          return {
            'Channel': ch,
            'Units': units, 'Orders': orders,
            'Gross Revenue': r0(v.rev),
            'Net Revenue (Ex GST)': r0(v.excRev),
            'AOV': orders ? r0((v.rev || 0) / orders) : (units ? r0((v.rev || 0) / units) : 0),
            'Share (out of 100)': pct2(v.rev, totalRev),
          }
        }),
    })
  }

  if (want.has('category')) {
    // Category rows come from catMap but their loss figures only exist on subCatMap, so the
    // children are rolled up to give the parent its cancel/RTO/CIR totals.
    const lossByCat = {}
    const subRows = []
    for (const [k, v] of Object.entries(subCatMap)) {
      const [cat, sc] = String(k).split('::')
      const e = lossByCat[cat] || (lossByCat[cat] = { cancelRev: 0, rtoRev: 0, cirRev: 0, returnRev: 0 })
      e.cancelRev += v.cancelRev || 0; e.rtoRev += v.rtoRev || 0
      e.cirRev += v.cirRev || 0; e.returnRev += v.returnRev || 0
      subRows.push({ cat, sc: sc || 'Others', ...v })
    }

    const catTotal = Object.values(catMap).reduce((s, v) => s + (v.rev || 0), 0)
    out.push({
      id: 'category', name: 'Category Revenue',
      rows: Object.entries(catMap)
        .sort((a, b) => (b[1].rev || 0) - (a[1].rev || 0))
        .map(([cat, v]) => {
          const L = lossByCat[cat] || { cancelRev: 0, rtoRev: 0, cirRev: 0, returnRev: 0 }
          const lost = L.cancelRev + L.rtoRev + L.cirRev + L.returnRev
          const units = v.aspUnits || v.units || 0
          return {
            'Category': cat, 'Units': units, 'Orders': orderCount(v),
            'Gross Revenue': r0(v.rev),
            'Net Revenue': r0((v.excRev || 0) * retainedShare(v.rev, lost)),
            'AOV': units ? r0((v.rev || 0) / units) : 0,
            'Cancelled': r0(L.cancelRev), 'RTO': r0(L.rtoRev), 'CIR': r0(L.cirRev), 'Return Rev': r0(L.returnRev),
            'Total Lost': r0(lost), 'Lost %': pct2(lost, v.rev),
            'Share (out of 100)': pct2(v.rev, catTotal),
          }
        }),
    })

    const subTotal = subRows.reduce((s, v) => s + (v.rev || 0), 0)
    out.push({
      id: 'subcategory', name: 'Sub-Category Revenue',
      rows: subRows.sort((a, b) => (b.rev || 0) - (a.rev || 0)).map(v => {
        const lost = (v.cancelRev || 0) + (v.rtoRev || 0) + (v.cirRev || 0) + (v.returnRev || 0)
        const units = v.aspUnits || v.units || 0
        return {
          'Category': v.cat, 'Sub-Category': v.sc, 'Units': units, 'Orders': orderCount(v),
          'Gross Revenue': r0(v.rev),
          'Net Revenue': r0((v.excRev || 0) * retainedShare(v.rev, lost)),
          'AOV': units ? r0((v.rev || 0) / units) : 0,
          'Cancelled': r0(v.cancelRev), 'RTO': r0(v.rtoRev), 'CIR': r0(v.cirRev), 'Return Rev': r0(v.returnRev),
          'Total Lost': r0(lost), 'Lost %': pct2(lost, v.rev),
          'Share (out of 100)': pct2(v.rev, subTotal),
        }
      }),
    })
  }

  // skuRows is flat and snake_case here, unlike every per-channel payload.
  if (want.has('skuTotals')) {
    const m = new Map()
    for (const x of skuRows) {
      if (!x.sku) continue
      const k = `${x.category || 'Others'}::${x.subCategory || 'Others'}::${x.sku}`
      const e = m.get(k) || {
        cat: x.category || 'Others', sc: x.subCategory || 'Others', sku: x.sku,
        units: 0, rev: 0, excRev: 0, cancelRev: 0, rtoRev: 0, cirRev: 0, returnRev: 0,
      }
      e.units += x.units || 0; e.rev += x.rev || 0; e.excRev += x.exc_rev || 0
      e.cancelRev += x.cancel_rev || 0; e.rtoRev += x.rto_rev || 0
      e.cirRev += x.cir_rev || 0; e.returnRev += x.return_rev || 0
      m.set(k, e)
    }
    const agg = [...m.values()].sort((a, b) => b.rev - a.rev)
    const total = agg.reduce((s, v) => s + v.rev, 0)
    out.push({
      id: 'skuTotals', name: 'SKU Totals',
      rows: agg.map(v => {
        const lost = v.cancelRev + v.rtoRev + v.cirRev + v.returnRev
        return {
          'Category': v.cat, 'Sub-Category': v.sc, 'SKU': v.sku, 'Units': v.units,
          'Gross Revenue': r0(v.rev),
          'Net Revenue': r0(v.excRev * retainedShare(v.rev, lost)),
          'AOV': v.units ? r0(v.rev / v.units) : 0,
          'Cancelled': r0(v.cancelRev), 'RTO': r0(v.rtoRev), 'CIR': r0(v.cirRev), 'Return Rev': r0(v.returnRev),
          'Total Lost': r0(lost), 'Lost %': pct2(lost, v.rev),
          'Share (out of 100)': pct2(v.rev, total),
        }
      }),
    })
  }

  if (want.has('sku')) {
    const daily = d.dailyArr || []
    out.push({
      id: 'sku', name: 'Day-wise by Channel',
      rows: daily.map(day => {
        const row = { 'Date': day.date }
        let tot = 0
        for (const ch of channels) {
          const rev = day[ch] || 0
          row[ch] = r0(rev)
          row[`${ch} Units`] = day[`${ch}_u`] || 0
          tot += rev
        }
        row['Total Revenue'] = r0(tot)
        return row
      }),
    })
  }

  if (want.has('states')) {
    const stateMap = d.stateMap || {}
    const stTotal = d.stateTotal || Object.values(stateMap).reduce((s, v) => s + (v.rev || 0), 0)
    out.push({
      id: 'states', name: 'Top States',
      rows: Object.entries(stateMap)
        .map(([state, v]) => ({ state, rev: v.rev || 0, orders: v.orders || 0, cities: v.cities?.size ?? v.cities ?? 0 }))
        .sort((a, b) => b.rev - a.rev)
        .map(s => ({
          'State': titleCase(s.state), 'Revenue': r0(s.rev), 'Orders': s.orders, 'Cities': s.cities,
          'AOV': s.orders ? r0(s.rev / s.orders) : 0,
          'Share (out of 100)': pct2(s.rev, stTotal),
        })),
    })
    const cRows = d.cityRows || []
    const ctTotal = d.cityTotal || cRows.reduce((s, r) => s + (r.rev || 0), 0)
    out.push({
      id: 'cities', name: 'Top Cities',
      rows: cRows.map(c => ({
        'City': c.city, 'State': c.state || '', 'Region': c.region || '', 'City Tier': c.cityTier || '',
        'Revenue': r0(c.rev), 'Orders': c.orders || 0,
        'AOV': c.orders ? r0(c.rev / c.orders) : 0,
        'Share (out of 100)': pct2(c.rev, ctTotal),
      })),
    })
  }

  return out
}
