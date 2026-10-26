import { useState, useRef, useEffect } from 'react'
import { C } from '../utils.js'
import { fmtSigned } from '../pnl/pnlUtils.js'
import InfoPopover from './InfoPopover.jsx'

// P&L margin watchlist (PNL_MASTER_PLAN.md Part B §3.1 laptop / §4 mobile), one card for every tab
// whose rules exist (useMarginRules.js). Laptop: a grid of rule tiles (4 per row); click a tile →
// onRule(id) filters the Financial View, click again clears. Mobile: rule rows (top 5 + "All n
// rules"), row → onOpenRule(id) (the caller's full-screen list). Rules still waiting for the previous
// period (Returns up / ASP down) keep their place as a skeleton, so nothing jumps when they arrive.
const M = C.m
const dotColor = r => (r.red ? M.down : M.amber)
// Optional per rule (Ads): line (custom sub-line), revLabel (instead of 'rev'), valueText (shown instead of the
// product count, e.g. '33.4%' for a channel-level rule; such a rule has no product list to open).
const impactLine = r => r.line ?? (r.count ? `${fmtSigned(r.impact)} ${r.what} · ${fmtSigned(r.revenue)} ${r.revLabel || 'rev'}` : 'All clear for this period')
// target (optional, Customer / Support): a channel-level rule with no product list; tapping it calls
// onRule / onOpenRule(id) so the page can jump to the section that explains it.
const hasList = r => r.count > 0 && ((r.items?.length ?? 0) > 0 || !!r.target)

// lines (optional): the rule list to show; default = the P&L bars (PNL_RULE_BARS) of `bars`.
function RulesPopover({ bars, channel, lines: given }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const lines = given || [
    bars.cm1 != null && `CM1 below ${bars.cm1}%`, bars.cogs != null && `COGS above ${bars.cogs}%`, bars.gm != null && `GM below ${bars.gm}%`,
    bars.ret != null && `Returns above ${bars.ret}% of gross`, bars.cm2Target != null && `Healthy CM2: ${bars.cm2Target}%`,
    `ASP down more than ${bars.aspDrop}% vs previous period`, bars.retUp != null && `Returns up more than ${bars.retUp} pts vs previous period`,
    'Products with < 1% of gross and < 50 units aren\'t checked',
  ].filter(Boolean)
  return (
    <span ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ border: 'none', background: 'transparent', color: C.t1, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', padding: '2px 4px' }}>Rules for {channel} ▾</button>
      {open && (
        <div role="dialog" aria-label={`Rules for ${channel}`} style={{ position: 'absolute', right: 0, top: '120%', zIndex: 40, width: 280, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: '10px 12px', fontSize: 12, color: C.t2, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: C.t1, marginBottom: 4 }}>{given ? `Rules for ${channel}` : `Bars for ${bars.label}`}</div>
          {lines.map(l => <div key={l}>· {l}</div>)}
          <div style={{ marginTop: 6, color: C.t3 }}>Set in src/config/metricTargets.js</div>
        </div>
      )}
    </span>
  )
}

export default function WatchlistCard({ result, channel, variant = 'laptop', activeRule = null, onRule, onOpenRule, pendingPrev = [], title = 'Margin watchlist' }) {
  if (!result) return null
  const { rules, triggered, flaggedProducts, smallCount, bars } = result
  const total = rules.length + pendingPrev.length
  // headerText (optional): replaces the product count line (rules without products)
  const header = result.headerText ?? `${triggered} of ${total} rule${total === 1 ? '' : 's'} triggered · ${flaggedProducts} product${flaggedProducts === 1 ? '' : 's'}`

  if (variant === 'mobile') {
    return <WatchlistMobile title={title} rules={rules} header={result.headerText ?? `${triggered} of ${total} rules · ${bars.label} bars`} smallCount={smallCount} onOpenRule={onOpenRule} pendingPrev={pendingPrev} />
  }
  return (
    <div className="kpi-card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.t1 }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: C.t3 }}>
          <span>{header}{smallCount ? ` · ${smallCount} small product${smallCount === 1 ? '' : 's'} not checked` : ''}</span>
          <RulesPopover bars={bars} channel={channel} lines={result.rulesLines} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 }}>
        {rules.map(r => {
          const on = activeRule === r.id
          return (
            <div key={r.id} role="button" tabIndex={0} aria-pressed={on} onClick={() => hasList(r) && onRule?.(on ? null : r.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRule?.(on ? null : r.id) } }}
              style={{ border: `1px solid ${on ? 'rgba(31,90,61,.35)' : C.border}`, boxShadow: on ? '0 0 10px 1px rgba(31,90,61,.12)' : 'none', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', background: C.card, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.t2, fontWeight: 600 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: r.count ? dotColor(r) : C.border2, flexShrink: 0 }} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                {r.info && <span onClick={e => e.stopPropagation()}><InfoPopover title={r.name} text={r.info} style={{ width: 20, height: 20, margin: '-4px 0' }} /></span>}
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: C.t1, fontVariantNumeric: 'tabular-nums' }}>{r.valueText ?? r.count}</span>
                {r.valueText == null && <span style={{ fontSize: 12, color: C.t3 }}>product{r.count === 1 ? '' : 's'}</span>}
              </div>
              <div style={{ fontSize: 12, color: r.count ? C.t2 : C.t3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>{impactLine(r)}</div>
            </div>
          )
        })}
        {pendingPrev.map(name => (
          <div key={name} aria-busy="true" style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', background: C.card }}>
            <div style={{ fontSize: 12.5, color: C.t2, fontWeight: 600 }}>{name}</div>
            <div style={{ marginTop: 6, height: 18, width: '40%', borderRadius: 4, background: C.bg }} />
            <div style={{ marginTop: 6, fontSize: 12, color: C.t3 }}>Loading the previous period…</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function WatchlistMobile({ title = 'Margin watchlist', rules, header, smallCount, onOpenRule, pendingPrev }) {
  const [all, setAll] = useState(false)
  const shown = all ? rules : rules.slice(0, 5)
  return (
    <section style={{ background: M.card, borderRadius: M.radius.card, padding: 16, boxShadow: M.cardShadow }}>
      <h2 style={{ margin: 0, fontSize: M.type.cardTitle, fontWeight: 700, color: M.ink }}>{title}</h2>
      <div style={{ fontSize: 12, color: M.muted, margin: '2px 0 8px' }}>{header}{smallCount ? ` · ${smallCount} small not checked` : ''}</div>
      {shown.map((r, i) => (
        <button key={r.id} type="button" onClick={() => hasList(r) && onOpenRule?.(r.id)} disabled={!hasList(r)}
          style={{ display: 'grid', gridTemplateColumns: '10px minmax(0,1fr) auto 14px', alignItems: 'center', gap: 8, width: '100%', minHeight: 52, padding: '6px 0', border: 'none', borderBottom: i < shown.length - 1 ? `1px solid ${M.line}` : 'none', background: 'transparent', textAlign: 'left', fontFamily: 'var(--font)', color: M.ink, cursor: r.count ? 'pointer' : 'default' }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: r.count ? dotColor(r) : M.g4 }} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{r.name}</span>
            <span style={{ display: 'block', fontSize: 12, color: M.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>{impactLine(r)}</span>
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: r.count ? M.ink : M.muted }}>{r.valueText ?? r.count}</span>
          <span aria-hidden="true" style={{ color: M.muted, fontSize: 16 }}>{hasList(r) ? '›' : ''}</span>
        </button>
      ))}
      {pendingPrev.map(name => (
        <div key={name} aria-busy="true" style={{ minHeight: 52, padding: '6px 0', borderTop: `1px solid ${M.line}`, fontSize: 13.5, fontWeight: 600, color: M.muted }}>{name}<div style={{ fontSize: 12, fontWeight: 400 }}>Loading the previous period…</div></div>
      ))}
      {rules.length > 5 && (
        <button type="button" onClick={() => setAll(a => !a)}
          style={{ marginTop: 10, width: '100%', minHeight: 44, borderRadius: 12, border: `1px solid ${M.line}`, background: '#fff', color: M.green, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
          {all ? 'Show top 5' : `All ${rules.length} rules →`}
        </button>
      )}
    </section>
  )
}
