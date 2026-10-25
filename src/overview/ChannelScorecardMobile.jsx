import { C } from '../utils.js'
import DeltaBadge from '../responsive/DeltaBadge.jsx'
import { metricStatus, statusColor } from '../config/metricTargets.js'

// Channel Scorecard on mobile (< 1024px). Every card has the same fixed rows, so each row lines up
// across the cards in a grid row:
//   1 logo + name · 2 value + ▲/▼ (same line) · 3 share bar · 4 "x% of revenue · n orders" (2 lines)
//   5 divider · 6 Net Rev / AOV / Return % rows
// Values come in pre-formatted from OverviewPage (the same per-channel figures the desktop cards use).
// channels: [{ key, name, logo, color, value, delta, sharePct, shareText, netRev, aov, returnPct }]
const ROWS = '24px 30px 6px 34px 1px auto'

// dense: narrowest phones (< 400px) - a little less padding and a 13px name so names and Net Rev fit.
export default function ChannelScorecardMobile({ channels, cols, dense = false }) {
  // Two-across on a phone a card is ~125px inside: value + ▲/▼ don't fit on one line, so the ▲/▼
  // moves to the top-right corner next to the name (spec A, "narrow cards") and the logo moves down
  // beside the value, giving the name the full row. Wider grids keep logo + name, value + ▲/▼.
  const corner = cols <= 2
  return (
    <div style={{ background: C.card, borderRadius: 18, padding: dense ? 12 : 16, boxShadow: C.sh1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: C.type.cardTitle.size, fontWeight: C.type.cardTitle.weight, color: C.t1 }}>Channel Scorecard</span>
        <span style={{ fontSize: 12, color: C.t3 }}>{channels.length} active channels</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: dense ? 8 : 10 }}>
        {channels.map(c => {
          const retColor = statusColor(metricStatus('returnPct', c.returnPct)) || C.t3
          const logo = c.logo
            ? <img src={c.logo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', borderRadius: 5, flexShrink: 0, background: c.key === 'CRED' ? '#1a1a1a' : '#f5f5f5' }} />
            : <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 5, background: c.color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>{c.name.charAt(0)}</span>
          return (
            <div key={c.key} style={{ display: 'grid', gridTemplateRows: ROWS, rowGap: 8, minWidth: 0, padding: dense ? '10px 10px 9px' : '12px 12px 10px', borderRadius: 14, background: C.card, border: `1px solid ${C.border}`, boxShadow: C.sh1 }}>
              {/* 1 name (+ logo when the card is wide; ▲/▼ in the corner when it is narrow) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {!corner && logo}
                <span title={c.name} style={{ fontSize: dense ? 13 : 14, fontWeight: 600, color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{c.name}</span>
                {corner && <DeltaBadge delta={c.delta} size={12} />}
              </div>
              {/* 2 value (+ ▲/▼ on the same line when wide; + logo when narrow) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0, whiteSpace: 'nowrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {corner && logo}
                  <span style={{ fontSize: 18, fontWeight: 700, color: C.t1, fontVariantNumeric: 'tabular-nums', overflow: 'hidden' }}>{c.value}</span>
                </span>
                {!corner && <DeltaBadge delta={c.delta} size={12} />}
              </div>
              {/* 3 share bar */}
              <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: `rgba(${C.accRgb},.12)`, overflow: 'hidden', alignSelf: 'center' }}>
                <div style={{ height: '100%', width: `${Math.min(100, c.sharePct)}%`, background: C.acc, borderRadius: 3 }} />
              </div>
              {/* 4 share + orders, fixed 2-line height */}
              <div style={{ fontSize: 12, lineHeight: '17px', color: C.t3, overflow: 'hidden' }}>{c.shareText}</div>
              {/* 5 divider */}
              <div aria-hidden="true" style={{ background: C.border }} />
              {/* 6 Net Rev / AOV / Return % */}
              <div style={{ display: 'grid', rowGap: 4 }}>
                {[['Net Rev', c.netRev, C.t1], ['AOV', c.aov, C.t1], ['Return %', c.returnPct == null ? '—' : `${c.returnPct.toFixed(1)}%`, c.returnPct == null ? C.t3 : retColor]].map(([k, v, col]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: C.t3, whiteSpace: 'nowrap' }}>{k}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: col, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
