import { C } from '../utils.js'
import { IC } from './theme.jsx'

// Small segmented toggle (Inward: By SKU / Sub-cat; Inventory cost: Product / SKU). Moved here unchanged from
// InwardPage.jsx so both pages share one component. `hit44` (opt-in, default off) keeps the same look but gives every
// segment a 44px tap area (the pill stays 30px; the button around it overflows the group vertically).
const M = C.m

export default function Seg({ options, value, onChange, isPhone, label, hit44 = false }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'inline-flex', background: isPhone ? M.soft : IC.page, borderRadius: 10, padding: 2, gap: 2, maxWidth: '100%' }}>
      {options.map(o => {
        const on = value === o.value
        const look = { background: on ? (isPhone ? '#fff' : IC.surface) : 'transparent', color: on ? IC.t1 : IC.t3, boxShadow: on ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }
        return hit44 ? (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
            style={{ minHeight: 44, minWidth: 44, margin: '-7px 0', padding: 0, border: 'none', background: 'none', fontFamily: 'var(--font)', cursor: 'pointer' }}>
            <span style={{ display: 'flex', alignItems: 'center', minHeight: 30, padding: '0 9px', borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', ...look }}>{o.label}</span>
          </button>
        ) : (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
            style={{ minHeight: 30, padding: isPhone ? '0 9px' : '0 10px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer', ...look }}>{o.label}</button>
        )
      })}
    </div>
  )
}
