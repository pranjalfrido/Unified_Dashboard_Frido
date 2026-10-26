// Header line under "Inventory" (INVENTORY_MOBILE_REDESIGN_PROMPT.md §1), from the values the
// desktop page already shows ("Snapshot …", "Latest sales …").
const day = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null)
const stamp = iso => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })

export function invCaption(tab, ctrl) {
  if (tab === 'sales') {
    const d = day(ctrl?.invSalesLastSales)
    return d ? `Unicommerce · sales till ${d}` : 'Unicommerce'
  }
  const parts = []
  if (ctrl?.invHealthAsOf) parts.push(`Updated ${stamp(ctrl.invHealthAsOf)}`)
  const d = day(ctrl?.invHealthLastSales)
  if (d) parts.push(`sales till ${d}`)
  return parts.join(' · ') || null
}
export const shortDay = day
