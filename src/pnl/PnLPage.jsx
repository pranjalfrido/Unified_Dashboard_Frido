import { useState, useMemo, useEffect } from 'react'
import PnLChannelTab from './PnLChannelTab.jsx'

// One subtab per Sales-tab channel + a consolidated "All Channels" tab — same bar, same visual
// chrome as SalesPage. Every channel's Category→Product(→SKU) map is rebuilt here the same way
// each existing Sales channel tab already does it (small local pick()/aggregation transforms
// reading straight off `data`), so this needs no new API endpoint — 100% reuse of /api/bq's
// existing response shape. See PNL_TAB_ROADMAP.md for the COGS/SnD prerequisites still pending;
// the Financial View table (PnLFinancialTable.jsx) renders those columns as "—" until then.
const PNL_TABS = [
  { id: 'all', label: 'All Channels' },
  { id: 'shopify', label: 'D2C', logo: '/logo-shopify.png' },
  { id: 'ebo', label: 'EBO', logo: '/ebo.png' },
  { id: 'amazon', label: 'Amazon', logo: '/logo-amazon.png' },
  { id: 'flipkart', label: 'Flipkart', logo: '/logo-flipkart.png' },
  { id: 'blinkit', label: 'Blinkit', logo: '/logo-blinkit.png' },
  { id: 'cred', label: 'CRED', logo: '/logo-cred.png' },
  { id: 'firstcry', label: 'Firstcry', logo: '/logo-firstcry.png' },
  { id: 'instamart', label: 'Instamart', logo: '/logo-instamart.png' },
  { id: 'zepto', label: 'Zepto', logo: '/logo-zepto.png' },
  { id: 'myntra', label: 'Myntra', logo: '/logo-myntra.png' },
  { id: 'offline', label: 'Offline Sales', logo: '/offline-sales.png' },
]

// Same shared per-row pick used by every existing FlatCategoryProductMatrix caller — kept
// local (not imported) since it's a 2-line pure function, not worth a shared-module trip.
const pick = v => ({ rev: v.rev || 0, excRev: v.excRev || 0, units: v.units || v.aspUnits || 0, returnUnits: v.returnUnits || 0, cancelRev: v.cancelRev || 0, codCancelRev: v.codCancelRev || 0, rtoRev: v.rtoRev || 0, cirRev: v.cirRev || 0, exchRev: v.exchRev || 0, returnRev: v.returnRev || 0 })

function netOf(subCatData) {
  let gross = 0, excRev = 0, net = 0, returnRev = 0, units = 0
  Object.values(subCatData || {}).forEach(scMap => {
    Object.values(scMap).forEach(d => {
      const totalReturn = ((d.cancelRev || 0) - (d.codCancelRev || 0)) + (d.rtoRev || 0) + (d.cirRev || 0) + (d.returnRev || 0)
      const gstRatio = d.rev > 0 ? (d.rev - d.excRev) / d.rev : 0
      gross += d.rev || 0
      excRev += d.excRev || 0
      units += d.units || 0
      returnRev += totalReturn
      net += (d.rev - totalReturn) * (1 - gstRatio)
    })
  })
  return { gross, excRev, net, units, returnRev }
}

// SnD rates — {weightGm, forward, rto, reverse, fulfilment}, sorted ascending by weightGm.
let sndRatesPromise = null
function loadSndRates() {
  if (!sndRatesPromise) sndRatesPromise = fetch('/snd-rates.json').then(r => r.ok ? r.json() : []).catch(() => [])
  return sndRatesPromise
}
function rateForSlab(slabs, weightSlab) {
  if (!slabs || !slabs.length || weightSlab == null) return null
  return slabs.find(s => s.weightGm === weightSlab) || null
}

export default function PnLPage({ data, filters, setFilters }) {
  const [activeTab, setActiveTab] = useState('all')
  const [amzChannelView, setAmzChannelView] = useState('all') // 'all' | 'sc' | 'vc'
  const [offlineSub, setOfflineSub] = useState('all') // 'all' | 'b2b' | 'Stockist' | 'MTGT'
  const [d2cRegion, setD2cRegion] = useState('india') // 'india' | 'international'
  const [d2cSubCh, setD2cSubCh] = useState('all') // 'all' | 'MyFrido' | 'Mobility'
  const [sndRates, setSndRates] = useState(null)

  useEffect(() => { loadSndRates().then(setSndRates) }, [])

  // Per-SKU D2C cost breakdown: logistics, fulfilment, payment gateway, software fee.
  // Logistics cost depends on Order_Status; fulfilment applies to all orders incl. cancelled.
  // Payment gateway = 1.1% of gross_inc_gst (D2C only). Software fee = ₹15 × units.
  // Filtered by d2cRegion/d2cSubCh so SND matches the revenue toggle selection.
  const shSkuCosts = useMemo(() => {
    const rows = data?.shopify?.skuCostRows
    if (!sndRates || !rows?.length) return {}
    const bySku = {}
    rows.forEach(row => {
      const { sku, subChannel, orderStatus, weightSlab, lineCount, totalQty, grossIncGst } = row
      if (!sku) return
      // Apply same sub-channel filter as revenue rows
      if (d2cSubCh === 'MyFrido' && subChannel !== 'myfrido') return
      if (d2cSubCh === 'Mobility' && subChannel !== 'mobility') return
      // Fallback: missing weight → treat as 2kg slab
      const effectiveSlab = weightSlab != null ? weightSlab : 2000
      const rate = rateForSlab(sndRates, effectiveSlab)
      // Logistics & fulfilment apply once per line item (lineCount), not per unit
      let logistics = 0
      let fulfilment = rate ? rate.fulfilment * lineCount : 0
      if (rate) {
        const st = (orderStatus || '').toLowerCase()
        if (st === 'cancelled') {
          logistics = 0
        } else if (st === 'rto') {
          logistics = (rate.forward + rate.rto) * lineCount
        } else if (st === 'cir' || st === 'exchange' || st === 'return') {
          logistics = (rate.forward + rate.reverse) * lineCount
        } else {
          logistics = rate.forward * lineCount
        }
      }
      const paymentGw = grossIncGst * 0.011
      const softwareFee = totalQty * 15
      if (!bySku[sku]) bySku[sku] = { logistics: 0, fulfilment: 0, paymentGw: 0, softwareFee: 0 }
      bySku[sku].logistics += logistics
      bySku[sku].fulfilment += fulfilment
      bySku[sku].paymentGw += paymentGw
      bySku[sku].softwareFee += softwareFee
    })
    return bySku
  }, [sndRates, data, d2cSubCh])

  const channelData = useMemo(() => {
    if (!data) return null

    // ── All Channels (consolidated) ──
    const allSubCatData = {}
    Object.entries(data.subCatMap || {}).forEach(([k, v]) => {
      const [cat, sc] = k.split('::')
      if (!allSubCatData[cat]) allSubCatData[cat] = {}
      allSubCatData[cat][sc || 'Others'] = pick(v)
    })
    const allSkuData = {}
    ;(data.skuRows || []).forEach(x => {
      const cat = x.category || 'Others', sc = x.subCategory || 'Others', sku = x.sku
      if (!sku) return
      if (!allSkuData[cat]) allSkuData[cat] = {}
      if (!allSkuData[cat][sc]) allSkuData[cat][sc] = {}
      if (!allSkuData[cat][sc][sku]) allSkuData[cat][sc][sku] = { rev: 0, units: 0 }
      allSkuData[cat][sc][sku].rev += x.rev || 0
      allSkuData[cat][sc][sku].units += x.units || 0
    })

    // ── D2C / Shopify — filtered by region + sub-channel toggles ──
    const sh = data.shopify || {}
    // Use salesCategoryOrders rows (have sub_channel) for D2C when filtering is active
    const allSalesCatRows = data.pnlSalesRows || [] // rows from salesCategoryOrders with sub_channel
    const shSalesCatRows = allSalesCatRows.filter(r => r.platform === 'Shopify')
    const filterD2CRow = r => {
      const sc = (r.sub_channel || '').toLowerCase()
      if (d2cRegion === 'india' && sc === 'shopify international') return false
      if (d2cRegion === 'international' && sc !== 'shopify international') return false
      if (d2cSubCh === 'MyFrido' && sc !== 'myfrido') return false
      if (d2cSubCh === 'Mobility' && sc !== 'mobility') return false
      return true
    }
    const shSubCatData = {}
    if (shSalesCatRows.length > 0) {
      shSalesCatRows.filter(filterD2CRow).forEach(r => {
        const cat = r.category || 'Others', sc = r.sub_category || 'Others'
        if (!shSubCatData[cat]) shSubCatData[cat] = {}
        if (!shSubCatData[cat][sc]) shSubCatData[cat][sc] = { rev: 0, excRev: 0, units: 0, returnUnits: 0, cancelRev: 0, codCancelRev: 0, rtoRev: 0, cirRev: 0, returnRev: 0 }
        shSubCatData[cat][sc].rev += parseFloat(r.gross_revenue) || 0
        shSubCatData[cat][sc].excRev += parseFloat(r.revenue) || 0
        shSubCatData[cat][sc].units = (shSubCatData[cat][sc].units || 0) + (parseInt(r.units) || 0)
        shSubCatData[cat][sc].returnUnits = (shSubCatData[cat][sc].returnUnits || 0) + (parseInt(r.return_units) || 0)
        shSubCatData[cat][sc].cancelRev += parseFloat(r.cancel_rev) || 0
        shSubCatData[cat][sc].codCancelRev += parseFloat(r.cod_cancel_rev) || 0
        shSubCatData[cat][sc].rtoRev += parseFloat(r.return_rev) || 0
        shSubCatData[cat][sc].cirRev += parseFloat(r.cir_rev) || 0
      })
      Object.keys(shSubCatData).forEach(cat => Object.keys(shSubCatData[cat]).forEach(sc => { shSubCatData[cat][sc] = pick(shSubCatData[cat][sc]) }))
    } else {
      // fallback to pre-aggregated shopify subCatMap (no sub-channel filtering)
      Object.entries(sh.subCatMap || {}).forEach(([k, v]) => {
        const [cat, sc] = k.split('::')
        if (!shSubCatData[cat]) shSubCatData[cat] = {}
        shSubCatData[cat][sc || 'Others'] = pick(v)
      })
    }
    const shSkuData = {}
    Object.entries(sh.skuMap || {}).forEach(([cat, scMap]) => {
      shSkuData[cat] = {}
      Object.entries(scMap).forEach(([sc, skMap]) => {
        shSkuData[cat][sc] = {}
        Object.entries(skMap).forEach(([sku, v]) => {
          const rows = v.subChannelRows || {}
          // Determine which subChannel rows to include based on d2cSubCh filter
          let keys = Object.keys(rows)
          if (d2cSubCh === 'MyFrido') keys = keys.filter(k => k === 'myfrido')
          else if (d2cSubCh === 'Mobility') keys = keys.filter(k => k === 'mobility')
          else keys = keys.filter(k => k !== 'shopify international')
          if (keys.length === 0) return
          // Aggregate selected subChannel rows into one entry
          const agg = { rev: 0, excRev: 0, units: 0, returnUnits: 0, cancelRev: 0, codCancelRev: 0, rtoRev: 0, cirRev: 0, exchRev: 0, returnRev: 0 }
          keys.forEach(k => { const r = rows[k]; Object.keys(agg).forEach(f => { agg[f] = (agg[f] || 0) + (r[f] || 0) }) })
          shSkuData[cat][sc][sku] = pick(agg)
        })
      })
    })

    // ── EBO ──
    const ebo = data.ebo || {}
    const eboSubCatData = {}
    Object.entries(ebo.subCatMap || {}).forEach(([k, v]) => {
      const [cat, sc] = k.split('::')
      if (!eboSubCatData[cat]) eboSubCatData[cat] = {}
      eboSubCatData[cat][sc || 'Others'] = pick(v)
    })
    const eboSkuData = {}
    Object.entries(ebo.skuMap || {}).forEach(([cat, scMap]) => {
      eboSkuData[cat] = {}
      Object.entries(scMap).forEach(([sc, skMap]) => {
        eboSkuData[cat][sc] = {}
        Object.entries(skMap).forEach(([sku, v]) => { eboSkuData[cat][sc][sku] = pick(v) })
      })
    })

    // ── Amazon (SC + VC combined, filtered by amzChannelView) ──
    const amzSC = data.amzSC || {}
    const amzVCMatrix = data.amzVCMatrix || {}
    const showSC = amzChannelView !== 'vc'
    const showVC = amzChannelView !== 'sc'
    const pickAmz = (scChData, vc) => {
      const r = {}
      ;['rev', 'excRev', 'units', 'cancelRev', 'rtoRev', 'cirRev', 'exchRev', 'returnRev'].forEach(k => {
        r[k] = (showSC ? (scChData?.FBA?.[k] || 0) + (scChData?.MFN?.[k] || 0) : 0) + (showVC ? (vc?.[k] || 0) : 0)
      })
      return r
    }
    const allScSub = amzSC.subCatChannel || {}
    const allVcSub = amzVCMatrix.subCatData || {}
    const amzSubCatData = {}
    new Set([...Object.keys(allScSub), ...Object.keys(allVcSub)]).forEach(cat => {
      amzSubCatData[cat] = {}
      new Set([...Object.keys(allScSub[cat] || {}), ...Object.keys(allVcSub[cat] || {})]).forEach(sc => {
        amzSubCatData[cat][sc] = pickAmz(allScSub[cat]?.[sc], allVcSub[cat]?.[sc])
      })
    })
    const allScSku = amzSC.skuChannel || {}
    const allVcSku = amzVCMatrix.skuData || {}
    const amzSkuData = {}
    new Set([...Object.keys(allScSku), ...Object.keys(allVcSku)]).forEach(cat => {
      amzSkuData[cat] = {}
      new Set([...Object.keys(allScSku[cat] || {}), ...Object.keys(allVcSku[cat] || {})]).forEach(sc => {
        amzSkuData[cat][sc] = {}
        new Set([...Object.keys(allScSku[cat]?.[sc] || {}), ...Object.keys(allVcSku[cat]?.[sc] || {})]).forEach(sku => {
          amzSkuData[cat][sc][sku] = pickAmz(allScSku[cat]?.[sc]?.[sku], allVcSku[cat]?.[sc]?.[sku])
        })
      })
    })
    // Amazon trend: SC daily (FBA+MFN pivoted) + VC has no reliable daily series, so trend uses SC only —
    // matches AmazonTab's own daily chart, which is SC-driven.
    const amzScDailyMap = {}
    ;(amzSC.daily || []).forEach(d => {
      if (!amzScDailyMap[d.date]) amzScDailyMap[d.date] = { date: d.date, rev: 0, excRev: 0, units: 0 }
      amzScDailyMap[d.date].rev += d.rev || 0
      amzScDailyMap[d.date].excRev += d.excRev || 0
      amzScDailyMap[d.date].units += d.units || 0
    })
    const amzDaily = Object.values(amzScDailyMap).sort((a, b) => a.date.localeCompare(b.date))

    // ── Flipkart ──
    const fk = data.flipkart || {}
    const fkCatMatrix = {}
    ;(fk.categories || []).forEach(c => { fkCatMatrix[c.category] = { rev: 0, excRev: 0, units: 0 } })
    const fkSubCatData = {}
    ;(fk.subCategories || []).forEach(x => {
      if (!fkSubCatData[x.category]) fkSubCatData[x.category] = {}
      fkSubCatData[x.category][x.subcategory] = pick({ rev: x.rev, excRev: x.excRev || 0, units: x.units })
    })
    const fkSkuData = fk.skuMatrix || {}

    // ── Blinkit / Instamart / Zepto (quick-commerce, identical shape) ──
    const qcSubCatOf = qc => {
      const m = {}
      ;(qc.subCategories || []).forEach(x => {
        if (!m[x.category]) m[x.category] = {}
        m[x.category][x.subcategory] = pick({ rev: x.rev, excRev: x.excRev || 0, units: x.units })
      })
      return m
    }
    const bl = data.blinkit || {}
    const ins = data.instamart || {}
    const zp = data.zepto || {}

    // ── CRED / Firstcry / Myntra (identical shape, real returnRev in totals) ──
    const simpleSubCatOf = (rows) => {
      const m = {}
      rows.forEach(x => {
        if (!m[x.category]) m[x.category] = {}
        m[x.category][x.subcategory] = pick({ rev: x.rev, excRev: x.excRev || 0, units: x.units, returnRev: x.returnRev || 0 })
      })
      return m
    }
    const cr = data.cred || {}
    const fc = data.firstcry || {}
    const mn = data.myntra || {}

    // ── Offline (row-array shape, sub-channel filterable) ──
    const off = data.offline || {}
    const filterOffSub = rows => {
      if (offlineSub === 'all') return rows
      if (offlineSub === 'b2b') return rows.filter(r => r.subChannel === 'Shopify B2B' || r.subChannel?.startsWith('Offline_B2B'))
      if (offlineSub === 'Stockist') return rows.filter(r => r.subChannel?.startsWith('Stockist'))
      return rows.filter(r => r.subChannel === offlineSub)
    }
    const offSubCatData = {}
    filterOffSub(off.subCategoryRows || []).forEach(x => {
      if (!offSubCatData[x.category]) offSubCatData[x.category] = {}
      if (!offSubCatData[x.category][x.subCategory]) offSubCatData[x.category][x.subCategory] = { rev: 0, excRev: 0, units: 0 }
      offSubCatData[x.category][x.subCategory].rev += x.rev || 0
      offSubCatData[x.category][x.subCategory].excRev += x.excRev || 0
      offSubCatData[x.category][x.subCategory].units += x.units || 0
    })
    Object.keys(offSubCatData).forEach(cat => Object.keys(offSubCatData[cat]).forEach(sc => { offSubCatData[cat][sc] = pick(offSubCatData[cat][sc]) }))
    const offSkuData = {}
    filterOffSub(off.skuRows || []).forEach(x => {
      if (!offSkuData[x.category]) offSkuData[x.category] = {}
      if (!offSkuData[x.category][x.subCategory]) offSkuData[x.category][x.subCategory] = {}
      if (!offSkuData[x.category][x.subCategory][x.sku]) offSkuData[x.category][x.subCategory][x.sku] = { rev: 0, excRev: 0, units: 0 }
      offSkuData[x.category][x.subCategory][x.sku].rev += x.rev || 0
      offSkuData[x.category][x.subCategory][x.sku].excRev += x.excRev || 0
      offSkuData[x.category][x.subCategory][x.sku].units += x.units || 0
    })
    const offDaily = filterOffSub(off.daily || [])

    return {
      all: { subCatData: allSubCatData, skuData: allSkuData, daily: data.dailyArr || [], gross: data.totalRev || 0, excRev: data.totalExcRev || 0, net: data.netRevenueCalc || 0, units: data.totalQty || 0, orders: data.nOrders || 0, returnRev: data.returnRev || 0 },
      shopify: (() => {
        const n = netOf(shSubCatData)
        // For Mobility sub-channel, override net revenue with manager-defined filter
        // (paid/pending/partially_paid × Delivered/Dispatched/Exchange/Blank, SellingPrice_Exc_GST)
        // computed server-side as mobilityNetCalc and stored in subChannelMap.Mobility.netRev
        if (d2cSubCh === 'Mobility') {
          const mobilityNet = data.subChannelMap?.Mobility?.netRev
          if (mobilityNet != null && mobilityNet > 0) n.net = mobilityNet
        }
        return { subCatData: shSubCatData, skuData: shSkuData, daily: sh.daily || [], ...n }
      })(),
      ebo: { subCatData: eboSubCatData, skuData: eboSkuData, daily: ebo.daily || [], gross: ebo.totals?.rev || 0, net: ebo.netCalc?.netRev ?? 0, units: ebo.totals?.qty || 0, orders: ebo.totals?.orders || 0, returnRev: (ebo.netCalc?.cancelRev || 0) + (ebo.netCalc?.rtoRev || 0) + (ebo.netCalc?.cirRev || 0) + (ebo.netCalc?.returnRev || 0) },
      amazon: (() => { const n = netOf(amzSubCatData); return { subCatData: amzSubCatData, skuData: amzSkuData, daily: amzDaily, ...n } })(),
      flipkart: (() => { const n = netOf(fkSubCatData); return { subCatData: fkSubCatData, skuData: fkSkuData, daily: fk.daily || [], ...n } })(),
      blinkit: (() => { const sc = qcSubCatOf(bl); const n = netOf(sc); return { subCatData: sc, skuData: bl.skuMatrix || {}, daily: bl.daily || [], ...n } })(),
      instamart: (() => { const sc = qcSubCatOf(ins); const n = netOf(sc); return { subCatData: sc, skuData: ins.skuMatrix || {}, daily: ins.daily || [], ...n } })(),
      zepto: (() => { const sc = qcSubCatOf(zp); const n = netOf(sc); return { subCatData: sc, skuData: zp.skuMatrix || {}, daily: zp.daily || [], ...n } })(),
      cred: (() => { const sc = simpleSubCatOf(cr.subCategories || []); const n = netOf(sc); return { subCatData: sc, skuData: cr.skuMatrix || {}, daily: cr.daily || [], ...n } })(),
      firstcry: (() => { const sc = simpleSubCatOf(fc.subCategories || []); const n = netOf(sc); return { subCatData: sc, skuData: fc.skuMatrix || {}, daily: fc.daily || [], ...n } })(),
      myntra: (() => { const sc = simpleSubCatOf(mn.subCategories || []); const n = netOf(sc); return { subCatData: sc, skuData: mn.skuMatrix || {}, daily: mn.daily || [], ...n } })(),
      offline: (() => { const n = netOf(offSubCatData); return { subCatData: offSubCatData, skuData: offSkuData, daily: offDaily, ...n } })(),
    }
  }, [data, amzChannelView, offlineSub, d2cRegion, d2cSubCh])

  if (!data || !channelData) return null

  const CHANNEL_COLORS = { all: '#94939F', shopify: '#FFD600', ebo: '#8B5E3C', amazon: '#E8930A', flipkart: '#2E74CC', blinkit: '#0D9E68', cred: '#CC4078', firstcry: '#9B56B6', instamart: '#4AB89A', zepto: '#858380', myntra: '#E87858', offline: '#6B7280' }

  const activeData = channelData[activeTab] || channelData.all
  const activeTabMeta = PNL_TABS.find(t => t.id === activeTab)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="sales-tabs">
        {PNL_TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`stab${activeTab === tab.id ? ' active' : ''}`} style={tab.id === 'all' ? { fontWeight: activeTab === 'all' ? 800 : 700, fontSize: 13 } : {}}>
            {tab.logo && <img src={tab.logo} alt="" style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, objectFit: 'contain', filter: tab.id === 'cred' ? 'invert(1)' : 'none' }} />}
            {tab.label}
          </button>
        ))}
      </div>
      <div className="page-scroll">
        {activeTab === 'shopify' && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 2, background: '#F2F1EF', border: '1px solid #E0DDD4', borderRadius: 8, padding: 3 }}>
              {[{ id: 'india', label: 'India' }, { id: 'international', label: 'International' }].map(opt => (
                <button key={opt.id} onClick={() => setD2cRegion(opt.id)} style={{ fontSize: 12, fontWeight: d2cRegion === opt.id ? 700 : 500, padding: '4px 12px', borderRadius: 6, border: 'none', background: d2cRegion === opt.id ? '#94939F' : 'transparent', color: d2cRegion === opt.id ? '#fff' : '#13121A', cursor: 'pointer' }}>{opt.label}</button>
              ))}
            </div>
            <div style={{ width: 1, height: 20, background: '#E0DDD4' }} />
            <div style={{ display: 'flex', gap: 2, background: '#F2F1EF', border: '1px solid #E0DDD4', borderRadius: 8, padding: 3 }}>
              {[{ id: 'all', label: 'All' }, { id: 'MyFrido', label: 'MyFrido' }, { id: 'Mobility', label: 'Mobility' }].map(opt => (
                <button key={opt.id} onClick={() => setD2cSubCh(opt.id)} style={{ fontSize: 12, fontWeight: d2cSubCh === opt.id ? 700 : 500, padding: '4px 12px', borderRadius: 6, border: 'none', background: d2cSubCh === opt.id ? '#94939F' : 'transparent', color: d2cSubCh === opt.id ? '#fff' : '#13121A', cursor: 'pointer' }}>{opt.label}</button>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'amazon' && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {[{ id: 'all', label: 'All' }, { id: 'sc', label: 'Seller Central' }, { id: 'vc', label: 'Vendor Central' }].map(opt => (
              <button key={opt.id} onClick={() => setAmzChannelView(opt.id)} style={{ fontSize: 12, fontWeight: amzChannelView === opt.id ? 700 : 500, padding: '5px 14px', borderRadius: 7, border: 'none', background: amzChannelView === opt.id ? '#FFD600' : 'transparent', color: '#13121A', cursor: 'pointer' }}>{opt.label}</button>
            ))}
          </div>
        )}
        {activeTab === 'offline' && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {[{ id: 'all', label: 'All' }, { id: 'b2b', label: 'B2B' }, { id: 'Stockist', label: 'Stockist' }, { id: 'MTGT', label: 'MT GT' }].map(opt => (
              <button key={opt.id} onClick={() => setOfflineSub(opt.id)} style={{ fontSize: 12, fontWeight: offlineSub === opt.id ? 700 : 500, padding: '5px 14px', borderRadius: 7, border: 'none', background: offlineSub === opt.id ? '#FFD600' : 'transparent', color: '#13121A', cursor: 'pointer' }}>{opt.label}</button>
            ))}
          </div>
        )}
        <PnLChannelTab
          title={activeTabMeta?.label || 'PnL'}
          note={activeTab === 'amazon' ? (amzChannelView === 'all' ? 'SC + VC' : amzChannelView === 'sc' ? 'Seller Central' : 'Vendor Central') : activeTab === 'offline' ? (offlineSub === 'all' ? undefined : offlineSub) : undefined}
          gross={activeData.gross}
          excRev={activeData.excRev}
          net={activeData.net}
          units={activeData.units}
          orders={activeData.orders}
          returnRev={activeData.returnRev}
          subCatData={activeData.subCatData}
          skuData={activeData.skuData}
          skuCosts={activeTab === 'shopify' ? shSkuCosts : undefined}
          adSpendMap={activeTab === 'shopify' ? (data?.pnlAdSpendMap || {}) : undefined}
          daily={activeData.daily}
          grossColor={CHANNEL_COLORS[activeTab] || '#FFD600'}
          gradId={`pnl${activeTab}Grad`}
        />
      </div>
    </div>
  )
}
