// Central permission tree — add new subtabs here, UI picks them up automatically.
// Entries with isGroup:true act as group headers — only their children keys are stored in user_permissions.
// Entries with children[] that are themselves groups allow nesting (e.g. logistics:cost sub-tabs).
export const PERMISSION_TREE = [
  { key: 'overview', label: 'Overview', children: [] },
  {
    key: 'sales', label: 'Sales & Ads', isGroup: true, children: [
      {
        key: 'sales', label: 'Sales', isGroup: true, children: [
          { key: 'sales:all',           label: 'Overall' },
          { key: 'sales:shopify',       label: 'D2C' },
          { key: 'sales:ebo',           label: 'EBO' },
          { key: 'sales:amazon',        label: 'Amazon' },
          { key: 'sales:flipkart',      label: 'Flipkart' },
          { key: 'sales:blinkit',       label: 'Blinkit' },
          { key: 'sales:cred',          label: 'CRED' },
          { key: 'sales:firstcry',      label: 'Firstcry' },
          { key: 'sales:instamart',     label: 'Instamart' },
          { key: 'sales:zepto',         label: 'Zepto' },
          { key: 'sales:myntra',        label: 'Myntra' },
          { key: 'sales:international', label: 'International' },
          { key: 'sales:offline',       label: 'Offline Sales' },
        ],
      },
      {
        key: 'ads', label: 'Ads', isGroup: true, children: [
          { key: 'ads:all',       label: 'Overall' },
          { key: 'ads:d2c',       label: 'D2C' },
          { key: 'ads:amazon',    label: 'Amazon' },
          { key: 'ads:blinkit',   label: 'Blinkit' },
          { key: 'ads:zepto',     label: 'Zepto' },
          { key: 'ads:instamart', label: 'Instamart' },
          { key: 'ads:flipkart',  label: 'Flipkart' },
          { key: 'ads:myntra',    label: 'Myntra' },
          { key: 'ads:cred',      label: 'CRED' },
        ],
      },
      {
        key: 'pnl', label: 'P&L Analytics', isGroup: true, children: [
          { key: 'pnl:all',           label: 'Overall' },
          { key: 'pnl:shopify',       label: 'D2C' },
          { key: 'pnl:ebo',           label: 'EBO' },
          { key: 'pnl:amazon',        label: 'Amazon' },
          { key: 'pnl:flipkart',      label: 'Flipkart' },
          { key: 'pnl:blinkit',       label: 'Blinkit' },
          { key: 'pnl:cred',          label: 'CRED' },
          { key: 'pnl:firstcry',      label: 'Firstcry' },
          { key: 'pnl:instamart',     label: 'Instamart' },
          { key: 'pnl:zepto',         label: 'Zepto' },
          { key: 'pnl:myntra',        label: 'Myntra' },
          { key: 'pnl:international', label: 'International' },
          { key: 'pnl:offline',       label: 'Offline Sales' },
        ],
      },
    ],
  },
  {
    key: 'logistics', label: 'Logistics', isGroup: true, children: [
      { key: 'logistics', label: 'Performance Analytics' },
      {
        key: 'logistics:cost', label: 'Cost Analytics', isGroup: true, children: [
          { key: 'logistics:cost:all', label: 'Overview' },
          { key: 'logistics:cost:b2c', label: 'B2C' },
          { key: 'logistics:cost:b2b', label: 'FTL/PTL' },
        ],
      },
    ],
  },
  {
    key: 'inventory', label: 'Inventory', isGroup: true, children: [
      { key: 'inventory',       label: 'Health & Overview' },
      { key: 'inventory:sales', label: 'Sales & Allocation' },
    ],
  },
  { key: 'customer',  label: 'Customer',  children: [] },
  { key: 'documents', label: 'Documents', children: [] },
]

export function hasPermission(allowedTabs, key) {
  if (!allowedTabs) return true
  return allowedTabs.includes(key)
}

// Returns all leaf permission keys under a node (including the node itself if it's a leaf)
export function getAllLeafKeys(node) {
  if (!node.isGroup) return [node.key]
  return node.children.flatMap(getAllLeafKeys)
}
