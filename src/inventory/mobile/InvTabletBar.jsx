import { C } from '../../utils.js'
import SegmentToggle from '../../responsive/SegmentToggle.jsx'
import ActionMenu from '../../responsive/ActionMenu.jsx'
import FilteredStrip from '../../responsive/FilteredStrip.jsx'
import { InvFilterButton } from './InvFilters.jsx'
import { invCaption } from './invCaption.js'
import { invStripItems, invRemoveFilter, invClearFilters } from './invFilterState.js'

// Tablets (769–1023px) keep the desktop top bar and sidebar (same as Sales), so the phone header's
// controls sit in this row above the mobile content: sub-tabs, the "Updated …" line, filters, "⋯".
const M = C.m

export default function InvTabletBar({ tab, setTab, ctrl, tabs }) {
  const strip = invStripItems(tab, ctrl)
  return (
    <div className="inv-tablet-bar" style={{ background: M.bg, padding: '12px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {tabs.length > 1 && <SegmentToggle label="Inventory view" options={tabs} value={tab} onChange={setTab} />}
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: M.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{invCaption(tab, ctrl)}</span>
        <ActionMenu items={ctrl.invMenu || []} tone="light" title={tab === 'sales' ? 'Inventory · Sales & Allocation' : 'Inventory · Inventory Health'} />
        <InvFilterButton tab={tab} ctrl={ctrl} tone="light" />
      </div>
      {strip.length > 0 && (
        <div style={{ margin: '8px -16px 0' }}>
          <FilteredStrip items={strip} tone="light" onRemove={k => invRemoveFilter(tab, ctrl, k)} onClear={() => invClearFilters(tab, ctrl)} />
        </div>
      )}
    </div>
  )
}
