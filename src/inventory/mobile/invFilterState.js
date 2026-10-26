// Inventory mobile filter state helpers (shared by InvFilters.jsx and the header in App.jsx).
// Keys are the desktop sidebars' own filter keys.
export const HEALTH_KEYS = ['location', 'stockStatus', 'websiteStatus', 'facility', 'category', 'subCategory', 'productId', 'rtdLevel']
export const SALES_KEYS = ['category', 'subCategory', 'sku', 'channel', 'salesType', 'facility', 'region']
export const SALES_CARD_KEYS = ['topChannel', 'matrixChannel']
const count = (f, keys) => keys.reduce((a, k) => a + (f?.[k]?.length ? 1 : 0), 0)
export const invFilterCount = (tab, ctrl) => tab === 'sales'
  ? count(ctrl?.invSalesFilters, [...SALES_KEYS, ...SALES_CARD_KEYS])
  : count(ctrl?.invHealthFilters, HEALTH_KEYS) + ((ctrl?.invHealthFilters?.avgSaleWindowDays || 7) !== 7 ? 1 : 0)

export const LABELS = {
  location: 'Location', stockStatus: 'Stock status', websiteStatus: 'Website status', facility: 'Facility', category: 'Category', subCategory: 'Sub-category',
  productId: 'SKU', rtdLevel: 'RTD level', sku: 'SKU', channel: 'Channel', salesType: 'Sales type', region: 'Region',
  topChannel: 'Top products channel', matrixChannel: 'Daily sales channel',
}
// "Filtered:" strip items for the header (FilteredStrip).
export function invStripItems(tab, ctrl) {
  const f = (tab === 'sales' ? ctrl?.invSalesFilters : ctrl?.invHealthFilters) || {}
  const keys = tab === 'sales' ? [...SALES_KEYS, ...SALES_CARD_KEYS] : HEALTH_KEYS
  const items = keys.filter(k => f[k]?.length).map(k => ({ key: k, label: LABELS[k], text: f[k].length > 1 ? `${f[k][0]} +${f[k].length - 1}` : f[k][0] }))
  if (tab !== 'sales' && (f.avgSaleWindowDays || 7) !== 7) items.push({ key: 'avgSaleWindowDays', label: 'Avg sale', text: `${f.avgSaleWindowDays} days` })
  return items
}
export function invRemoveFilter(tab, ctrl, key) {
  const set = tab === 'sales' ? ctrl?.setInvSalesFilters : ctrl?.setInvHealthFilters
  set?.(f => { const n = { ...f }; delete n[key]; return n })
}
export function invClearFilters(tab, ctrl) {
  if (tab === 'sales') ctrl?.setInvSalesFilters?.(f => ({ comparePrevious: f.comparePrevious, momentumWindow: f.momentumWindow }))
  else ctrl?.setInvHealthFilters?.(() => ({}))
}
