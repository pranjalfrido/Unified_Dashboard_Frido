import { C } from '../utils.js'
import DeltaBadge from '../responsive/DeltaBadge.jsx'
import { metricStatus } from '../config/metricTargets.js'

// Channel Scorecard on mobile (< 1024px). Every card has the same fixed rows, so each row lines up
// across the cards in a grid row:
//   1 logo + name · 2 value + ▲/▼ (same line) · 3 share bar · 4 "x% of revenue · n orders" (2 lines)
//   5 divider · 6 Net Rev / AOV / Return % rows
// Values come in pre-formatted from OverviewPage (the same per-channel figures the desktop cards use).
// One mobile palette (C.m): Frido-green share bars, status as a small dot, no per-brand colours.
// channels: [{ key, name, logo, color, value, delta, sharePct, shareText, netRev, aov, returnPct }]
const ROWS = '24px 30px 6px 34px 1px auto'

// dense: narrowest phones (< 400px) - a little less padding and a 13px name so names and Net Rev fit.
export default function ChannelScorecardMobile({ channels, cols, dense = false }) {
  const M = C.m
  const DOT = { good: M.up, warn: M.amber, bad: M.down }
  // Two-across on a phone a card is ~125px inside: value + ▲/▼ don't fit on one line, so the ▲/▼
  // moves to the top-right corner next to the name (spec A, "narrow cards") and the logo moves down
  // beside the value, giving the name the full row. Wider grids keep logo + name, value + ▲/▼.
  const corner = cols <= 2
  return (
    <div style={{ background: M.card, borderRadius: M.radius.card, padding: dense ? 12 : 16, boxShadow: M.cardShadow }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: M.type.cardTitle, fontWeight: 700, color: M.ink }}>Channel Scorecard</span>
        <span style={{ fontSize: 12, color: M.muted }}>{channels.length} active channels</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: dense ? 8 : 10 }}>
        {channels.map(c => {
          const dot = DOT[metricStatus('returnPct', c.returnPct)]
          const logo = c.logo
            ? <img src={c.logo} alt="" style={{ width: 20, height: 20, objectFit: 'contain', borderRadius: 5, flexShrink: 0, background: c.key === 'CRED' ? '#1a1a1a' : '#fff' }} />
            : <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 5, background: M.green, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>{c.name.charAt(0)}</span>
          return (
            <div key={c.key} style={{ display: 'grid', gridTemplateRows: ROWS, rowGap: 8, minWidth: 0, padding: dense ? '10px 10px 9px' : '12px 12px 10px', borderRadius: M.radius.tile, background: M.soft, border: `1px solid ${M.tileBorder}` }}>
              {/* 1 name (+ logo when the card is wide; ▲/▼ in the corner when it is narrow) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {!corner && logo}
                <span title={c.name} style={{ fontSize: dense ? 13 : 14, fontWeight: 600, color: M.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{c.name}</span>
                {corner && <DeltaBadge delta={c.delta} size={12} />}
              </div>
              {/* 2 value (+ ▲/▼ on the same line when wide; + logo when narrow) */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0, whiteSpace: 'nowrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {corner && logo}
                  <span style={{ fontSize: 18, fontWeight: 700, color: M.ink, fontVariantNumeric: 'tabular-nums', overflow: 'hidden' }}>{c.value}</span>
                </span>
                {!corner && <DeltaBadge delta={c.delta} size={12} />}
              </div>
              {/* 3 share bar */}
              <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: M.g4, overflow: 'hidden', alignSelf: 'center' }}>
                <div style={{ height: '100%', width: `${Math.min(100, c.sharePct)}%`, background: M.green, borderRadius: 3 }} />
              </div>
              {/* 4 share + orders, fixed 2-line height */}
              <div style={{ fontSize: 12, lineHeight: '17px', color: M.muted, overflow: 'hidden' }}>{c.shareText}</div>
              {/* 5 divider */}
              <div aria-hidden="true" style={{ background: M.g4 }} />
              {/* 6 Net Rev / AOV / Return % (status = dot before the value, the value stays ink) */}
              <div style={{ display: 'grid', rowGap: 4 }}>
                {[['Net Rev', c.netRev, null], ['AOV', c.aov, null], ['Return %', c.returnPct == null ? '—' : `${c.returnPct.toFixed(1)}%`, c.returnPct == null ? null : dot]].map(([k, v, d]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: M.muted, whiteSpace: 'nowrap' }}>{k}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, fontSize: 14, fontWeight: 600, color: M.ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {d && <span aria-label={`status ${metricStatus('returnPct', c.returnPct)}`} style={{ width: 7, height: 7, borderRadius: '50%', background: d, flexShrink: 0 }} />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                    </span>
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
