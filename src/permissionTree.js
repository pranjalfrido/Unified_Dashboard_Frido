// Central permission tree — add new subtabs here, UI picks them up automatically
export const PERMISSION_TREE = [
  { key: 'overview',   label: 'Overview',    children: [] },
  { key: 'sales',      label: 'Sales & Ads', children: [] },
  { key: 'ads',        label: 'Ads',         children: [] },
  {
    key: 'logistics', label: 'Logistics', children: [
      { key: 'logistics:cost', label: 'Cost Analytics' },
    ],
  },
  {
    key: 'inventory', label: 'Inventory', children: [
      { key: 'inventory:sales', label: 'Sales & Allocation' },
    ],
  },
  { key: 'customer',   label: 'Customer',   children: [] },
  { key: 'documents',  label: 'Documents',  children: [] },
]

export function hasPermission(allowedTabs, key) {
  if (!allowedTabs) return true
  return allowedTabs.includes(key)
}
