import { C } from '../utils.js'
import DeltaBadge from '../responsive/DeltaBadge.jsx'
import MixBar from '../responsive/MixBar.jsx'
import { useReturnAnalysis } from './returnAnalysisData.js'

// Sales → D2C on phones: the way into Return Analysis (RETURN_ANALYSIS_MOBILE_PROMPT §2b). Today's
// numbers from the same request the Return Analysis page sends (all D2C: the page always opens on
// all D2C), so the two always agree; tapping anywhere opens the page.
const M = C.m
const p1 = v => `${(v || 0).toFixed(1)}%`

export default function ReturnEntryCard({ filters, subCatFirstOrderMap, onOpen, subTab }) {
  const { data, error } = useReturnAnalysis({ filters: { ...filters, subChannel: '' }, subCatFirstOrderMap })
  const k = data?.kpis
  const delta = k && k.prevReturnPct ? (k.returnPct - k.prevReturnPct) / k.prevReturnPct * 100 : null
  return (
    <button type="button" onClick={onOpen} className="ra-entry" aria-label="Open return analysis"
      style={{ display: 'block', width: '100%', textAlign: 'left', background: M.card, borderRadius: M.radius.card, padding: 16, boxShadow: M.cardShadow, border: 'none', fontFamily: 'var(--font)', color: M.ink, cursor: 'pointer', minHeight: 104 }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: M.type.cardTitle, fontWeight: 700 }}>Return analysis</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: M.muted }}>
          {subTab && 'All D2C'}<span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1, color: M.green }}>›</span>
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 6px', marginTop: 6, minHeight: 40, fontSize: 13, color: M.muted, fontVariantNumeric: 'tabular-nums' }}>
        {k ? (
          <>
            <span>Return <b style={{ color: M.ink }}>{p1(k.returnPct)}</b></span>
            <DeltaBadge delta={delta} lowerIsBetter size={12} />
            <span style={{ flexBasis: '100%' }}>Cancel <b style={{ color: M.ink }}>{p1(k.cancelPct)}</b> · RTO <b style={{ color: M.ink }}>{p1(k.rtoPct)}</b> · CIR <b style={{ color: M.ink }}>{p1(k.cirPct)}</b></span>
          </>
        ) : error ? <span>Couldn't load return numbers</span>
          : <span className="skel" style={{ display: 'inline-block', width: '80%', height: 14, borderRadius: 6, background: M.soft }} />}
      </span>
      <MixBar label="Cancel, RTO and CIR" height={6} style={{ marginTop: 10 }}
        parts={k ? [{ key: 'cancel', label: 'Cancel', value: k.cancelPct, color: M.green }, { key: 'rto', label: 'RTO', value: k.rtoPct, color: M.g2 }, { key: 'cir', label: 'CIR', value: k.cirPct, color: M.g3 }] : []} fmt={p1} />
    </button>
  )
}
