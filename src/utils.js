export const C = {
  acc: '#FFD600', acl: '#FFF9CC', acm: '#E6C200',
  bg: '#F2F1EF', card: '#fff', border: '#E8E6DC', border2: '#D6D0B0',
  t1: '#13121A', t2: '#504F68', t3: '#94939F',
  green: { bg: '#E6F4E0', tx: '#286010', bd: '#9DD470' },
  red:   { bg: '#FDE8E8', tx: '#7A1A1A', bd: '#F09898' },
  amber: { bg: '#FEF2DC', tx: '#7A4000', bd: '#F5C460' },
  blue:  { bg: '#E1EFFD', tx: '#184078', bd: '#7AB4EE' },
  ch: {
    Shopify: '#FFD600', 'Shopify International': '#B8A000', Amazon: '#E8930A', Flipkart: '#2E74CC',
    Blinkit: '#0D9E68', CRED: '#CC4078', Instamart: '#4AB89A',
    Zepto: '#858380', Myntra: '#E87858', Firstcry: '#9B56B6', Pharmeasy: '#2ECC71'
  }
}

export const fmt = v => {
  if (v == null || isNaN(v)) return '₹0'
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`
  return `₹${Math.round(v).toLocaleString('en-IN')}`
}
export const fmtN = v => (v || 0).toLocaleString('en-IN')
export const pct = (a, b) => b ? ((a / b) * 100).toFixed(1) + '%' : '0%'

export function processData(rows) {
  const orderMap = {}
  rows.forEach(r => {
    if (!orderMap[r.OrderId]) {
      orderMap[r.OrderId] = {
        orderId: r.OrderId, rev: 0, excRev: 0, qty: 0, items: 0,
        channel: r.Channel, subChannel: r.SubChannel, channelAccount: r.ChannelAccount,
        date: r.OrderDate?.slice(0, 10), state: r.State, city: r.City,
        customerId: r.CustomerId, voucher: r.voucher_code,
        dispatchDate: r.Dispatch_Date, deliverDate: r.Delivered_Date, orderStatus: r.Order_Status,
        financialStatus: r.FinancialStatus, fulfilmentStatus: r.FulfilmentStatus,
        isRTO: false, isCIR: false, isExchange: false, isCancelled: false,
      }
    }
    const o = orderMap[r.OrderId]
    o.rev += parseFloat(r.SellingPrice_Inc_GST || 0)
    o.excRev += parseFloat(r.SellingPrice_Exc_GST || 0)
    o.qty += parseInt(r.ItemQty || 0)
    o.items += 1
    if (r.is_rto == 1) o.isRTO = true
    if (r.is_CIR_return == 1) o.isCIR = true
    if (r.is_exchange == 1) o.isExchange = true
    if (r.is_cancelled == 1) o.isCancelled = true
  })
  const orders = Object.values(orderMap)
  const totalRev = orders.reduce((s, o) => s + o.rev, 0)
  const totalExcRev = orders.reduce((s, o) => s + o.excRev, 0)
  const totalQty = orders.reduce((s, o) => s + o.qty, 0)
  const nOrders = orders.length
  const blendedAOV = nOrders ? totalRev / nOrders : 0
  const uniqueDates = [...new Set(orders.map(o => o.date).filter(Boolean))].sort()
  const nDays = uniqueDates.length || 1

  const chMap = {}
  orders.forEach(o => {
    if (!chMap[o.channel]) chMap[o.channel] = { rev: 0, orders: 0, qty: 0 }
    chMap[o.channel].rev += o.rev; chMap[o.channel].orders += 1; chMap[o.channel].qty += o.qty
  })

  const dailyChMap = {}
  orders.forEach(o => {
    const k = `${o.date}__${o.channel}`
    if (!dailyChMap[k]) dailyChMap[k] = { rev: 0, orders: 0, date: o.date, channel: o.channel }
    dailyChMap[k].rev += o.rev; dailyChMap[k].orders += 1
  })
  const dailyMap = {}
  Object.values(dailyChMap).forEach(d => {
    if (!dailyMap[d.date]) dailyMap[d.date] = { date: d.date }
    dailyMap[d.date][d.channel] = (dailyMap[d.date][d.channel] || 0) + d.rev
    dailyMap[d.date][d.channel + '_o'] = (dailyMap[d.date][d.channel + '_o'] || 0) + d.orders
  })
  const dailyArr = uniqueDates.map(d => dailyMap[d] || { date: d })

  const catMap = {}
  rows.forEach(r => {
    const cat = r.Category || 'Unknown'
    if (!catMap[cat]) catMap[cat] = { rev: 0, excRev: 0, orders: new Set(), units: 0 }
    catMap[cat].rev += parseFloat(r.SellingPrice_Inc_GST || 0)
    catMap[cat].excRev += parseFloat(r.SellingPrice_Exc_GST || 0)
    catMap[cat].orders.add(r.OrderId)
    catMap[cat].units += parseInt(r.ItemQty || 0)
  })

  const subCatMap = {}
  rows.forEach(r => {
    const sc = r.SubCategory || 'Unknown'
    if (!subCatMap[sc]) subCatMap[sc] = { rev: 0, orders: new Set() }
    subCatMap[sc].rev += parseFloat(r.SellingPrice_Inc_GST || 0)
    subCatMap[sc].orders.add(r.OrderId)
  })

  const stateMap = {}
  orders.forEach(o => {
    const s = ((o.state || 'Unknown').toUpperCase().trim()) || 'Unknown'
    if (!stateMap[s]) stateMap[s] = { rev: 0, orders: 0, cities: new Set() }
    stateMap[s].rev += o.rev; stateMap[s].orders += 1
    if (o.city) stateMap[s].cities.add(o.city.toUpperCase().trim())
  })

  const custFreqMap = {}
  orders.forEach(o => { if (o.customerId) custFreqMap[o.customerId] = (custFreqMap[o.customerId] || 0) + 1 })
  const custFreq = Object.values(custFreqMap)
  const nCusts = custFreq.length
  const repeatCusts = custFreq.filter(n => n >= 2).length

  const tatOrders = orders.filter(o => o.date && o.deliverDate).map(o => {
    return Math.round((new Date(o.deliverDate.slice(0, 10)) - new Date(o.date)) / 86400000)
  }).filter(d => d >= 0 && d <= 60)

  const bucketKeys = ['<₹500', '₹500-1K', '₹1K-2.5K', '₹2.5K-5K', '₹5K-10K', '₹10K-25K', '₹25K+']
  const buckets = Object.fromEntries(bucketKeys.map(k => [k, 0]))
  const bucketRev = Object.fromEntries(bucketKeys.map(k => [k, 0]))
  orders.forEach(o => {
    const v = o.rev
    const k = v < 500 ? '<₹500' : v < 1000 ? '₹500-1K' : v < 2500 ? '₹1K-2.5K' : v < 5000 ? '₹2.5K-5K' : v < 10000 ? '₹5K-10K' : v < 25000 ? '₹10K-25K' : '₹25K+'
    buckets[k]++; bucketRev[k] += v
  })

  const voucherMap = {}
  orders.forEach(o => {
    const v = o.voucher || ''
    const k = !v ? 'No voucher' : v.toUpperCase().includes('PREPAID') ? 'PREPAID-DISCOUNT' : v.toUpperCase().includes('PLM') ? 'Loyalty (PLM)' : v.toUpperCase().includes('FRV') ? 'Repeat (FRV)' : 'Other/custom'
    if (!voucherMap[k]) voucherMap[k] = { orders: 0, rev: 0 }
    voucherMap[k].orders++; voucherMap[k].rev += o.rev
  })

  const gstMap = {}
  rows.forEach(r => {
    const g = r.GST_Tax_Type_Code || 'Unknown'
    if (!gstMap[g]) gstMap[g] = { rev: 0, orders: new Set() }
    gstMap[g].rev += parseFloat(r.SellingPrice_Inc_GST || 0); gstMap[g].orders.add(r.OrderId)
  })

  return { totalRev, totalExcRev, totalQty, nOrders, blendedAOV, nDays, gstCollected: totalRev - totalExcRev, dailyArr, catMap, subCatMap, chMap, stateMap, nCusts, repeatCusts, tatOrders, buckets, bucketRev, voucherMap, gstMap, orders, rows, uniqueDates }
}

export function detectAlerts(data) {
  const alerts = []
  const { orders, totalRev, uniqueDates, chMap, rows, nCusts, repeatCusts } = data
  const mid = Math.floor(uniqueDates.length / 2)
  const fh = new Set(uniqueDates.slice(0, mid)), lh = new Set(uniqueDates.slice(mid))
  const fr = orders.filter(o => fh.has(o.date)).reduce((s, o) => s + o.rev, 0)
  const lr = orders.filter(o => lh.has(o.date)).reduce((s, o) => s + o.rev, 0)
  if (fr > 0 && (lr - fr) / fr * 100 < -10) alerts.push({ type: 'red', title: `Revenue declining ${Math.abs(((lr - fr) / fr) * 100).toFixed(1)}%`, body: `First half ${fmt(fr)} vs last half ${fmt(lr)}.` })
  const blRows = rows.filter(r => r.Channel === 'Blinkit' && parseFloat(r.SellingPrice_Exc_GST || 0) > 0)
  if (blRows.length) {
    const blInc = blRows.reduce((s, r) => s + parseFloat(r.SellingPrice_Inc_GST || 0), 0)
    const blExc = blRows.reduce((s, r) => s + parseFloat(r.SellingPrice_Exc_GST || 0), 0)
    if (blExc > 0 && (blInc - blExc) / blExc * 100 > 50) alerts.push({ type: 'red', title: 'Blinkit GST pipeline broken', body: `Implied GST = ${((blInc - blExc) / blExc * 100).toFixed(0)}%.` })
  }
  const credByDay = {}
  orders.filter(o => o.channel === 'CRED').forEach(o => { credByDay[o.date] = (credByDay[o.date] || 0) + o.rev })
  const credRevs = Object.values(credByDay)
  if (credRevs.length >= 3) {
    const mean = credRevs.reduce((a, b) => a + b, 0) / credRevs.length
    const gaps = Object.entries(credByDay).filter(([, v]) => v < mean * 0.2)
    if (gaps.length) alerts.push({ type: 'red', title: `CRED feed gap: ${gaps.map(([d]) => d).join(', ')}`, body: `Revenue on gap days vs mean ${fmt(mean)}/day.` })
  }
  const shopO = orders.filter(o => o.channel === 'Shopify')
  const cirRate = shopO.length ? shopO.filter(o => o.isCIR).length / shopO.length * 100 : 0
  if (cirRate > 10) alerts.push({ type: 'amber', title: `CIR returns ${cirRate.toFixed(1)}% (Shopify)`, body: 'Review sizing and product quality.' })
  const repeatRate = nCusts ? repeatCusts / nCusts * 100 : 0
  if (repeatRate < 10 && nCusts > 0) alerts.push({ type: 'amber', title: `Repeat rate only ${repeatRate.toFixed(1)}%`, body: 'Launch CRM and loyalty programme.' })
  const qcChannels = ['Blinkit', 'Instamart', 'Zepto']
  const qcRev = qcChannels.reduce((s, c) => s + (chMap[c]?.rev || 0), 0)
  const qcOrds = qcChannels.reduce((s, c) => s + (chMap[c]?.orders || 0), 0)
  const qcAOV = qcOrds ? qcRev / qcOrds : 0
  if (qcAOV > 3000) alerts.push({ type: 'green', title: `Q-commerce AOV ${fmt(qcAOV)} — scale up`, body: 'Expand SKU catalogue across all 3 platforms.' })
  return alerts
}

export function exportCSV(rows) {
  if (!rows?.length) return
  const cols = Object.keys(rows[0])
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'frido_export.csv'; a.click()
  URL.revokeObjectURL(url)
}

export function getDefaultDates() {
  const end = new Date(), start = new Date()
  start.setDate(start.getDate() - 6)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}
