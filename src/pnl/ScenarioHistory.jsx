import { useState, useEffect } from 'react'
import { C } from '../utils.js'

// Shared "save & compare" history table for both planning tools (Price Simulator, Breakeven ROAS
// Calculator) — each saved scenario is a snapshot of that tool's inputs + headline results at the
// moment the user clicked Save, so they can name a few candidate promos/launch prices and see
// them side by side instead of re-typing numbers to remember what they tried. Persisted per-
// browser via localStorage (same try/catch pattern App.jsx already uses for logistics_stale) —
// this is a personal scratchpad, not shared team data, so no backend/API round-trip is needed.
const STORAGE_PREFIX = 'pnl_scenarios_'

function loadScenarios(storageKey) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function saveScenarios(storageKey, scenarios) {
  try { localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(scenarios)) } catch {}
}

// columns: [{ key, label, format?: v => string, highlight?: bool }]
export default function ScenarioHistory({ storageKey, columns, currentSnapshot, maxRows = 8 }) {
  const [scenarios, setScenarios] = useState(() => loadScenarios(storageKey))
  const [nameDraft, setNameDraft] = useState('')

  useEffect(() => { saveScenarios(storageKey, scenarios) }, [storageKey, scenarios])

  const handleSave = () => {
    const name = nameDraft.trim() || `Scenario ${scenarios.length + 1}`
    const entry = { id: Date.now(), name, savedAt: Date.now(), ...currentSnapshot }
    setScenarios(prev => [entry, ...prev].slice(0, maxRows))
    setNameDraft('')
  }
  const handleDelete = id => setScenarios(prev => prev.filter(s => s.id !== id))
  const handleClearAll = () => setScenarios([])

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.t1, textTransform: 'uppercase', letterSpacing: 0.4 }}>Saved Scenarios</div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>Save the current inputs to compare against other options — kept in this browser only.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={nameDraft} onChange={e => setNameDraft(e.target.value)} placeholder="Name this scenario…"
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            style={{ padding: '8px 12px', borderRadius: 9, border: `1px solid ${C.border2}`, fontSize: 13, fontWeight: 500, color: C.t1, width: 190 }}
          />
          <button onClick={handleSave} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: C.acc, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Save Current
          </button>
        </div>
      </div>

      {scenarios.length === 0 ? (
        <div style={{ fontSize: 13, color: C.t3, padding: '18px 0', textAlign: 'center' }}>
          No scenarios saved yet — adjust the inputs above, then click "Save Current" to start comparing.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 10px 8px 0', borderBottom: `1px solid ${C.border2}` }}>Scenario</th>
                {columns.map(col => (
                  <th key={col.key} style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.3, padding: '0 10px 8px', borderBottom: `1px solid ${C.border2}`, whiteSpace: 'nowrap' }}>{col.label}</th>
                ))}
                <th style={{ width: 32, borderBottom: `1px solid ${C.border2}` }} />
              </tr>
            </thead>
            <tbody>
              {scenarios.map(s => (
                <tr key={s.id}>
                  <td style={{ padding: '10px 10px 10px 0', fontSize: 13, fontWeight: 600, color: C.t1, borderBottom: `1px solid ${C.border}` }}>
                    {s.name}
                    <div style={{ fontSize: 10.5, color: C.t3, fontWeight: 500, marginTop: 1 }}>{new Date(s.savedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                  {columns.map(col => (
                    <td key={col.key} style={{ textAlign: 'right', padding: '10px', fontSize: 13, fontWeight: col.highlight ? 800 : 600, color: col.highlight ? C.acd : C.t1, borderBottom: `1px solid ${C.border}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {col.format ? col.format(s[col.key]) : (s[col.key] ?? '—')}
                    </td>
                  ))}
                  <td style={{ borderBottom: `1px solid ${C.border}`, textAlign: 'center' }}>
                    <button onClick={() => handleDelete(s.id)} title="Remove"
                      style={{ border: 'none', background: 'transparent', color: C.t3, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 4 }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={handleClearAll} style={{ border: 'none', background: 'transparent', color: C.t3, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
