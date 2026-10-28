import { C } from '../utils.js'
import { fmtSigned } from '../pnl/pnlUtils.js'

// Biggest fixes (PNL_MASTER_PLAN.md Part B §3.3 / §4): the products furthest below the channel's CM1
// bar in ₹ (the watchlist's CM1 rule, largest gap first). Laptop: top 6, "Simulate ↗" when a tool
// supports the channel. Mobile: top 3 + "All n →" (the caller's full-screen list).
const M = C.m
const pct = v => (v != null ? `${v.toFixed(1)}%` : '—')

export default function BiggestFixes({ items = [], bar, variant = 'laptop', onSimulate, onAll, limit }) {
  const top = items.slice(0, limit ?? (variant === 'mobile' ? 3 : 6))
  const mobile = variant === 'mobile'
  return (
    <div>
      {!top.length && <div style={{ fontSize: 13, color: mobile ? M.muted : C.t3, padding: '8px 0' }}>All clear for this period</div>}
      {top.map((x, i) => {
        const r = x.row
        return (
          <div key={x.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', alignItems: 'center', gap: 10, padding: mobile ? '8px 0' : '9px 0', borderBottom: i < top.length - 1 ? `1px solid ${mobile ? M.line : C.border}` : 'none' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: mobile ? 13.5 : 13, fontWeight: 600, color: mobile ? M.ink : C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.sc}>{r.sc}</div>
              <div style={{ fontSize: 12, color: mobile ? M.muted : C.t3, fontVariantNumeric: 'tabular-nums' }}>
                {mobile ? `CM1 ${pct(r.cm1Pct)} · COGS ${pct(r.cogsPct)}` : `CM1 ${pct(r.cm1Pct)} · GM ${pct(r.gmPct)} · SnD ${pct(r.sndPct)} · COGS ${pct(r.cogsPct)}`}
              </div>
            </div>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: mobile ? M.down : C.red.tx, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }} title={`₹ CM1 below the ${bar}% bar`}>{fmtSigned(x.impact)}</span>
            {onSimulate
              ? <button type="button" onClick={() => onSimulate(x.key)} style={{ minHeight: mobile ? 36 : 28, padding: '0 10px', borderRadius: 8, border: `1px solid ${mobile ? M.line : C.border2}`, background: '#fff', color: mobile ? M.green : C.t1, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>{mobile ? 'Sim ↗' : 'Simulate ↗'}</button>
              : <span />}
          </div>
        )
      })}
      {mobile && items.length > top.length && (
        <button type="button" onClick={onAll} style={{ marginTop: 10, width: '100%', minHeight: 44, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.green, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>All {items.length} →</button>
      )}
    </div>
  )
}
