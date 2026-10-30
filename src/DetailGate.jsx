// Per-section loading / error state for staged /api/bq loading (src/bqPhaseMerge.js).
//
// The Dashboard renders a page as soon as /api/bq's 'fast' phase lands, then loads the detail group
// that page needs ('sales_detail' / 'pnl_detail' / 'ads_detail') in the background. Until it lands,
// the fields it carries are empty placeholders ([] / {} / 0), so any section built from them is
// wrapped in <DetailGate>: a skeleton while loading (never a blank card, a misleading 0 or an empty
// chart that reads as "no data"), or a small inline error + Retry for just that section if the
// detail request failed. Everything else on the page keeps rendering normally either way.
//
// The status comes from DetailPhaseContext, provided once per page by the Dashboard. No provider
// (or a static pre-computed payload, which is always complete) means 'ready', so a gate can never
// hide data that is already there.
import Skeleton from './responsive/Skeleton.jsx'
import { C } from './utils.js'
import { useDetailPhase } from './detailPhase.js'

export function DetailGate({ label = 'Loading details', height = 140, children, style, compact = false, phase }) {
  const { status, error, retry } = useDetailPhase(phase)
  if (status === 'ready') return children ?? null
  const box = {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
    padding: compact ? '10px 12px' : '14px 16px', minHeight: compact ? undefined : height,
    display: 'flex', flexDirection: 'column', gap: 10, boxSizing: 'border-box', ...style,
  }
  if (status === 'error') {
    return (
      <div role="alert" style={{ ...box, minHeight: compact ? undefined : Math.min(height, 96), justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: C.red.tx }}>
          <span>⚠ Couldn't load this section{error ? ` (${String(error).slice(0, 120)})` : ''}.</span>
          {retry && (
            <button type="button" onClick={retry}
              style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 10px', borderRadius: 5, border: `1px solid ${C.red.bd}`, background: 'transparent', color: C.red.tx, cursor: 'pointer', fontFamily: 'var(--font)' }}>
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }
  return (
    <div style={box} aria-busy="true">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.t3 }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${C.border}`, borderTopColor: C.acc, animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
        <span>{label}…</span>
      </div>
      {!compact && (
        <>
          <Skeleton width="100%" height={14} label={label} />
          <Skeleton width="85%" height={14} label={label} />
          <Skeleton width="70%" height={14} label={label} />
        </>
      )}
    </div>
  )
}
