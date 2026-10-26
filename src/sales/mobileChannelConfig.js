import { fmt } from '../utils.js'

// Sales tab, mobile layout per channel (docs/responsive/SALES_MOBILE_REDESIGN_PROMPT.md, decisions of
// 2026-10-26). A new channel or card is a change here, not a new layout. Values never come from
// here - each channel tab computes them as its desktop view does and SalesMobileView arranges them.
//   tiles        master-card tiles in order; always an even count; the first one is the hero
//   deltas       ▲/▼ on the card: all or none. false where desktop lacks a ▲/▼ on any tile
//   sections     cards under the master card, in order (channel-specific cards sit after
//                Categories and before the geography cards)
//   productSorts the channel's desktop Category Revenue Matrix columns, as sort chips
//   sku          the SKU view exists (desktop has SKU rows for the channel)

const pct2 = v => (v == null || !isFinite(v) ? '—' : `${v.toFixed(2)}%`)
const vsPrev = r => (r.prevNet > 0 ? (r.net - r.prevNet) / r.prevNet * 100 : null)

// Same columns and formats as FlatCategoryProductMatrix (src/App.jsx).
export const PRODUCT_SORTS = {
  gross: { key: 'gross', label: 'Gross rev', value: r => r.gross, format: r => fmt(r.gross) },
  net: { key: 'net', label: 'Net rev', value: r => r.net, format: r => fmt(r.net) },
  vsPrev: { key: 'vsPrev', label: 'vs Prev', value: vsPrev, format: r => { const v = vsPrev(r); return v == null ? '—' : `${v >= 0 ? '▲' : '▼'}${Math.abs(v).toFixed(1)}%` } },
  units: { key: 'units', label: 'Units', value: r => r.units, format: r => r.units.toLocaleString('en-IN') },
  drr: { key: 'drr', label: 'DRR', value: r => r.drr, format: r => (r.drr == null ? '—' : `${Math.max(1, Math.round(r.drr)).toLocaleString('en-IN')}/day`) },
  asp: { key: 'asp', label: 'ASP', value: r => r.asp, format: r => `₹${Math.round(r.asp).toLocaleString('en-IN')}` },
  cancelPct: { key: 'cancelPct', label: 'Cancel %', bar: 'bad', value: r => r.cancelPct, format: r => pct2(r.cancelPct) },
  rtoPct: { key: 'rtoPct', label: 'RTO %', bar: 'bad', value: r => r.rtoPct, format: r => pct2(r.rtoPct) },
  cirPct: { key: 'cirPct', label: 'CIR %', bar: 'bad', value: r => r.cirPct, format: r => pct2(r.cirPct) },
  exchPct: { key: 'exchPct', label: 'Exchange %', bar: 'bad', value: r => r.exchPct, format: r => pct2(r.exchPct) },
  totalReturnPct: { key: 'totalReturnPct', label: 'Total return %', bar: 'bad', value: r => r.totalReturnPct, format: r => pct2(r.totalReturnPct) },
  returnPct: { key: 'returnPct', label: 'Return %', bar: 'bad', value: r => r.totalReturnPct, format: r => pct2(r.totalReturnPct) },
}
const BASE = ['gross', 'net', 'vsPrev', 'units', 'drr', 'asp']
const DETAILED = [...BASE, 'cancelPct', 'rtoPct', 'cirPct', 'exchPct', 'totalReturnPct']
const SIMPLE = [...BASE, 'returnPct']

const QUICK = { tiles: ['gross', 'net', 'dailyNet', 'orders', 'aov', 'asp'], deltas: true, sections: ['categories', 'regionTier', 'geo'], productSorts: BASE, sku: false }
const MARKET = { tiles: ['gross', 'net', 'dailyNet', 'aov', 'asp', 'orders', 'returnPct', 'cancelPct'], deltas: false, sections: ['categories', 'regionTier', 'geo'], productSorts: SIMPLE, sku: true }

export const SALES_MOBILE = {
  all: { tiles: ['gross', 'net', 'atRisk', 'aov', 'dailyNet', 'asp', 'gst', 'returnPct'], deltas: true, sections: ['channelShare', 'categories', 'regionTier', 'geo'], productSorts: SIMPLE, sku: true },
  shopify: { tiles: ['gross', 'net', 'dailyNet', 'aov', 'asp', 'returnPct', 'rtoPct', 'cirPct', 'cancelPct', 'exchangePct'], deltas: true, sections: ['categories', 'reasons', 'regionTier', 'geo'], productSorts: DETAILED, sku: true },
  ebo: { tiles: ['gross', 'net', 'dailyNet', 'aov', 'asp', 'returnPct', 'rtoPct', 'cirPct', 'cancelPct', 'exchangePct'], deltas: true, sections: ['categories', 'stores', 'reasons', 'regionTier', 'geo'], productSorts: DETAILED, sku: true },
  // Amazon Overall: desktop has no ▲/▼ on Returns % → none on the card (all or none).
  'amazon:all': { tiles: ['gross', 'grossSc', 'grossVc', 'net', 'dailyNet', 'asp', 'aov', 'returnPct'], deltas: false, sections: ['categories', 'accounts', 'geo'], productSorts: SIMPLE, sku: true },
  'amazon:sc': { tiles: ['gross', 'net', 'gst', 'dailyNet', 'asp', 'aov', 'cancelPct', 'returnPct'], deltas: false, sections: ['categories', 'regionTier', 'geo'], productSorts: SIMPLE, sku: true },
  'amazon:vc': { tiles: ['gross', 'net', 'gst', 'dailyNet', 'asp', 'returnPct'], deltas: false, sections: ['categories', 'accounts', 'geo'], productSorts: SIMPLE, sku: true },
  // Flipkart: GST instead of Delivered % (no desktop ▲/▼); Delivered % moves into Returns %'s definition.
  flipkart: { tiles: ['gross', 'net', 'dailyNet', 'aov', 'asp', 'gst', 'cancelPct', 'returnPct'], deltas: true, sections: ['categories', 'regionTier', 'geo'], productSorts: SIMPLE, sku: true },
  blinkit: QUICK,
  instamart: QUICK,
  zepto: QUICK,
  cred: MARKET,
  firstcry: MARKET,
  myntra: { ...MARKET, tiles: ['gross', 'net', 'dailyNet', 'aov', 'asp', 'activeProducts', 'returnPct', 'cancelPct'] },
  offline: { tiles: ['gross', 'net', 'dailyNet', 'aov', 'asp', 'orders', 'upo', 'creditNotesPct'], deltas: true, sections: ['categories', 'regionTier', 'geo'], productSorts: BASE, sku: true },
  international: { placeholder: { title: 'International sales', text: 'Calculation pending. International orders have their own channel since Aug 2026; the Sales breakdown is not built yet.' } },
}

// Channel chips in the header (same order and permission keys as the desktop tab bar).
export const SALES_SUBTABS = {
  amazon: [{ id: 'all', label: 'Overall' }, { id: 'sc', label: 'Seller Central' }, { id: 'vc', label: 'Vendor Central' }],
}
