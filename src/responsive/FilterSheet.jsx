import { useState } from 'react'
import { C } from '../utils.js'
import BottomSheet from './BottomSheet.jsx'
import FilterPicker from './FilterPicker.jsx'

// Mobile filters (docs/responsive/MOBILE_DESIGN_SYSTEM.md §2). Level 1: one row per filter with its
// current value; tapping a row opens level 2 (FilterPicker) in the same sheet. Small choices
// (a few fixed options) render inline as a segmented toggle instead of a picker.
//   rows: [{ key, label, summary, set, options, selected, multi, noun, onApply(values) }]
//         or { key, label, toggle: [{ id, label }], value, onChange(id) }
//   onReset → clear every filter in the sheet; resetLabel / doneLabel name the two footer buttons
//   a row's fmtRank / searchAll / searchAllNote pass through to FilterPicker
export default function FilterSheet({ open, onClose, title = 'Filters', rows, onReset, resetLabel = 'Reset', doneLabel = 'Done' }) {
  const M = C.m
  const [pickKey, setPickKey] = useState(null)
  const close = () => { setPickKey(null); onClose() }
  const picking = rows.find(r => r.key === pickKey)
  return (
    <BottomSheet open={open} onClose={close} title={title}>
      {picking ? (
        <FilterPicker key={picking.key} title={picking.label} noun={picking.noun} options={picking.options} selected={picking.selected} multi={picking.multi !== false}
          fmtRank={picking.fmtRank} searchAll={picking.searchAll} searchAllNote={picking.searchAllNote}
          onBack={() => setPickKey(null)} onApply={v => { picking.onApply(v); setPickKey(null) }} />
      ) : (
        <div>
          {rows.map(r => r.toggle ? (
            <div key={r.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 52, borderTop: `1px solid ${M.line}` }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: M.ink }}>{r.label}</span>
              <span role="group" aria-label={r.label} style={{ display: 'flex', background: M.soft, borderRadius: 9, padding: 2 }}>
                {r.toggle.map(o => (
                  <button key={o.id} type="button" aria-pressed={r.value === o.id} onClick={() => r.onChange(o.id)}
                    style={{ minHeight: 32, border: 'none', borderRadius: 7, padding: '0 9px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
                      background: r.value === o.id ? '#fff' : 'transparent', color: r.value === o.id ? M.ink : M.muted, boxShadow: r.value === o.id ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{o.label}</button>
                ))}
              </span>
            </div>
          ) : (
            <button key={r.key} type="button" onClick={() => setPickKey(r.key)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', minHeight: 56, padding: '8px 0', border: 'none', borderTop: `1px solid ${M.line}`, background: 'none', textAlign: 'left', fontFamily: 'var(--font)', cursor: 'pointer' }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: M.ink }}>{r.label}</span>
                <span style={{ display: 'block', fontSize: 12.5, marginTop: 2, color: r.set ? M.green : M.muted, fontWeight: r.set ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.summary}</span>
              </span>
              <span style={{ fontSize: 12, color: M.muted, whiteSpace: 'nowrap' }}>{r.options.length} ›</span>
            </button>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {onReset && <button type="button" onClick={onReset}
              style={{ flex: 1, minHeight: 46, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.ink, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>{resetLabel}</button>}
            <button type="button" onClick={close}
              style={{ flex: 1, minHeight: 46, borderRadius: 12, border: 'none', background: M.green, color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' }}>{doneLabel}</button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
