import { useState } from 'react'
import { C, fmt, fmtN } from '../utils.js'
import CompactRankRow from '../responsive/CompactRankRow.jsx'
import BottomSheet from '../responsive/BottomSheet.jsx'

// Overview mobile "Top States" (mockups/sales_mobile_mockup.html Geography): the map full-width,
// then the states as compact ranked rows - top 8, "Show all N states" grows the list in place (no
// inner scroll). Tap a state → sheet with its revenue, orders and top cities. Same stateMap /
// cityRows the map uses; share = state revenue / total revenue of the period.
const TOP = 8
const title = s => (s || '').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase())

export default function TopStatesMobile({ map, stateMap, cityRows = [], totalRev, period }) {
  const M = C.m
  const [all, setAll] = useState(false)
  const [sel, setSel] = useState(null)
  const states = Object.entries(stateMap || {}).filter(([, v]) => v?.rev > 0).sort((a, b) => b[1].rev - a[1].rev)
  const max = states[0]?.[1].rev || 1
  const share = rev => (totalRev > 0 ? `${(rev / totalRev * 100).toFixed(1)}%` : '—')
  const shown = all ? states : states.slice(0, TOP)
  const cities = sel ? cityRows.filter(c => (c.state || '').trim().toUpperCase() === sel[0]).sort((a, b) => b.rev - a.rev).slice(0, 10) : []
  const cityMax = cities[0]?.rev || 1
  return (
    <div style={{ background: M.card, borderRadius: M.radius.card, padding: 16, boxShadow: M.cardShadow, overflow: 'hidden' }}>
      <div style={{ fontSize: M.type.cardTitle, fontWeight: 700, color: M.ink }}>Top States</div>
      <div style={{ fontSize: 12, color: M.muted, marginTop: 2, marginBottom: 8 }}>By revenue · tap a state for its cities</div>
      {map}
      <div style={{ marginTop: 10 }}>
        {shown.map(([k, v], i) => (
          <CompactRankRow key={k} name={`${i + 1}. ${title(k)}`} value={fmt(v.rev)} pct={share(v.rev)} barPct={v.rev / max * 100}
            last={i === shown.length - 1} onClick={() => setSel([k, v])} />
        ))}
      </div>
      {states.length > TOP && (
        <button type="button" onClick={() => setAll(a => !a)}
          style={{ marginTop: 10, width: '100%', minHeight: 44, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.green, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          {all ? `Show top ${TOP}` : `Show all ${states.length} states`}
        </button>
      )}
      <BottomSheet open={!!sel} onClose={() => setSel(null)} title={sel ? title(sel[0]) : ''} subtitle={period}>
        {sel && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
              {[['Revenue', fmt(sel[1].rev)], ['Share', share(sel[1].rev)], ['Orders', sel[1].orders != null ? fmtN(sel[1].orders) : '—']].map(([k, v]) => (
                <div key={k} style={{ background: M.soft, borderRadius: M.radius.tile, padding: '10px 12px', minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', color: M.muted }}>{k}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: M.ink, marginTop: 3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: M.muted, margin: '14px 0 2px' }}>Top cities</div>
            {cities.length ? cities.map((c, i) => (
              <CompactRankRow key={c.city} name={`${i + 1}. ${title(c.city)}`} value={fmt(c.rev)} pct={sel[1].rev > 0 ? `${(c.rev / sel[1].rev * 100).toFixed(1)}%` : '—'}
                barPct={c.rev / cityMax * 100} last={i === cities.length - 1} />
            )) : <div style={{ fontSize: 13, color: M.muted, padding: '8px 0' }}>No city breakdown for this state.</div>}
          </>
        )}
      </BottomSheet>
    </div>
  )
}
