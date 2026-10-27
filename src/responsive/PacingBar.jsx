import { C } from '../utils.js'

// Month pacing: spent so far + month-end at today's run rate (spent ÷ days elapsed × days in month),
// one bar with the two parts. budget (optional): adds "₹x budget · ₹y over / under" and a marker.
const M = C.m

export default function PacingBar({ spent, projected, daysElapsed, daysInMonth, budget = null, fmt }) {
  const max = Math.max(projected, budget || 0) || 1
  const pctSpent = spent / max * 100
  const pctProj = Math.max(0, projected - spent) / max * 100
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        <span><b style={{ color: M.ink }}>{fmt(spent)}</b> <span style={{ color: M.muted }}>spent · {daysElapsed} of {daysInMonth} days</span></span>
        <span style={{ color: M.g2 }}><b>{fmt(projected)}</b> at month-end</span>
      </div>
      <div style={{ position: 'relative', height: 10, borderRadius: 5, background: M.line, marginTop: 8, overflow: 'hidden' }} role="img" aria-label={`${fmt(spent)} spent, ${fmt(projected)} projected for the month`}>
        <i style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pctSpent}%`, background: M.green }} />
        <i style={{ position: 'absolute', left: `${pctSpent}%`, top: 0, bottom: 0, width: `${pctProj}%`, background: M.g3 }} />
        {budget != null && <i style={{ position: 'absolute', left: `calc(${budget / max * 100}% - 1px)`, top: -2, bottom: -2, width: 2, background: M.ink }} />}
      </div>
      <div style={{ fontSize: 12, color: M.muted, marginTop: 6 }}>
        Run rate {fmt(spent / Math.max(1, daysElapsed))} / day{budget != null ? ` · ${fmt(budget)} budget · ${fmt(Math.abs(projected - budget))} ${projected > budget ? 'over' : 'under'}` : ' · no budget source'}
      </div>
    </div>
  )
}
