// Ordering shared by MobileRankedList and FullScreenList. dir 'desc' = highest first (the default
// everywhere); 'asc' = lowest first. Rows without a value always go last. Bars use |value| so a
// negative margin still gets a bar of its size.
export function rankItems(items, value, dir = 'desc') {
  const sign = dir === 'asc' ? -1 : 1
  return [...items].sort((a, b) => {
    const va = value(a), vb = value(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return sign * (vb - va)
  })
}
export const barMax = (rows, value) => Math.max(...rows.map(it => Math.abs(value(it) || 0)), 0) || 1
export const barPctOf = (it, value, max) => (Math.abs(value(it) || 0) / max) * 100
