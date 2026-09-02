// Central permission tree — add new subtabs here, UI picks them up automatically.
// Entries with children[] act as group headers in the UI — the group label itself
// is not a permission key; only the children keys are stored in user_permissions.
// For Logistics: 'logistics' = Performance Analytics, 'logistics:cost' = Cost Analytics
// For Inventory: 'inventory' = Health & Overview,    'inventory:sales' = Sales & Allocation
export const PERMISSION_TREE = [
  { key: 'overview',   label: 'Overview',    children: [] },
  { key: 'sales',      label: 'Sales & Ads', children: [] },
  { key: 'ads',        label: 'Ads',         children: [] },
  {
    key: 'logistics', label: 'Logistics', isGroup: true, children: [
      { key: 'logistics',      label: 'Performance Analytics' },
      { key: 'logistics:cost', label: 'Cost Analytics' },
    ],
  },
  {
    key: 'inventory', label: 'Inventory', isGroup: true, children: [
      { key: 'inventory',       label: 'Health & Overview' },
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
